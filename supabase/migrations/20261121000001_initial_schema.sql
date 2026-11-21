-- ============================================================
-- SalikurVouch: Initial PostgreSQL Schema (PRD v1.1 Section 6)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. Profil Admin & Role (terhubung dengan Supabase Auth)
CREATE TABLE public.admin_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'operator')),
  telegram_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2a. Audit Log Login
CREATE TABLE public.auth_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username_attempted TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_audit_logs_user_id ON public.auth_audit_logs(user_id);
CREATE INDEX idx_auth_audit_logs_created_at ON public.auth_audit_logs(created_at DESC);

-- 2b. Reset PIN Telegram OTP
CREATE TABLE public.password_reset_otps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_otps_user_id ON public.password_reset_otps(user_id);

-- 3. Konfigurasi Router MikroTik (mendukung RouterOS v6 & v7, siap multi-router)
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INT NOT NULL DEFAULT 8728,
  ros_version TEXT NOT NULL DEFAULT 'v6' CHECK (ros_version IN ('v6', 'v7')),
  connection_mode TEXT NOT NULL DEFAULT 'api_tcp' CHECK (connection_mode IN ('api_tcp', 'api_ssl', 'rest_api')),
  allow_self_signed_tls BOOLEAN NOT NULL DEFAULT TRUE,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  dns_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_routers_updated_at
  BEFORE UPDATE ON public.routers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Pengaturan Sistem, Bot Telegram & PPOB (singleton row id = 1)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token_encrypted TEXT,
  bot_username TEXT,
  bot_mode TEXT NOT NULL DEFAULT 'saldo_only' CHECK (bot_mode IN ('saldo_only', 'nonsaldo_only', 'hybrid')),
  webhook_secret TEXT,
  owner_username TEXT,
  owner_telegram_id BIGINT,
  max_deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 1000000,
  low_balance_threshold NUMERIC(14,2) NOT NULL DEFAULT 10000,
  ppob_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ppob_markup_small_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  ppob_markup_large_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  ppob_markup_threshold NUMERIC(14,2) NOT NULL DEFAULT 100000,
  ppob_proxy_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Template Pesan Bot Telegram
CREATE TABLE public.bot_message_templates (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_bot_message_templates_updated_at
  BEFORE UPDATE ON public.bot_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Master Paket Voucher
CREATE TABLE public.voucher_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id UUID REFERENCES public.routers(id) ON DELETE CASCADE,
  legacy_slot_id TEXT,
  mode TEXT NOT NULL DEFAULT 'saldo' CHECK (mode IN ('saldo', 'nonsaldo')),
  name TEXT NOT NULL,
  menu_label TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup NUMERIC(14,2) NOT NULL DEFAULT 0,
  mikrotik_server TEXT NOT NULL DEFAULT 'all',
  mikrotik_profile TEXT NOT NULL,
  limit_uptime TEXT DEFAULT '00:00:00',
  limit_download_mb INT NOT NULL DEFAULT 0,
  limit_upload_mb INT NOT NULL DEFAULT 0,
  limit_total_mb INT NOT NULL DEFAULT 0,
  login_type TEXT NOT NULL DEFAULT 'vc' CHECK (login_type IN ('vc', 'up')),
  char_type TEXT NOT NULL DEFAULT '6',
  code_length INT NOT NULL DEFAULT 5 CHECK (code_length BETWEEN 3 AND 16),
  card_color TEXT NOT NULL DEFAULT '#20a8d8',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_voucher_packages_router_id ON public.voucher_packages(router_id);
CREATE INDEX idx_voucher_packages_mode_active ON public.voucher_packages(mode, is_active, sort_order);

CREATE TRIGGER trg_voucher_packages_updated_at
  BEFORE UPDATE ON public.voucher_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Master Reseller / Agen
CREATE TABLE public.resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  vouchers_sold INT NOT NULL DEFAULT 0,
  reseller_type TEXT DEFAULT 'agent',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  notes TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resellers_status ON public.resellers(status);

CREATE TRIGGER trg_resellers_updated_at
  BEFORE UPDATE ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Batch Pembuatan Voucher
CREATE TABLE public.voucher_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT UNIQUE NOT NULL,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.voucher_packages(id) ON DELETE SET NULL,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'web_batch' CHECK (source IN ('bot_saldo', 'bot_nonsaldo', 'web_custom', 'web_batch')),
  package_name TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  deducted_balance BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_sent BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_voucher_batches_reseller_id ON public.voucher_batches(reseller_id);
CREATE INDEX idx_voucher_batches_package_id ON public.voucher_batches(package_id);
CREATE INDEX idx_voucher_batches_router_id ON public.voucher_batches(router_id);
CREATE INDEX idx_voucher_batches_created_by ON public.voucher_batches(created_by);
CREATE INDEX idx_voucher_batches_created_at ON public.voucher_batches(created_at DESC);

-- 9. Detail Kode Voucher
CREATE TABLE public.vouchers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID REFERENCES public.voucher_batches(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.voucher_packages(id) ON DELETE SET NULL,
  mikrotik_api_id TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  login_type TEXT NOT NULL DEFAULT 'vc',
  profile TEXT,
  time_limit TEXT,
  data_limit_label TEXT,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  dns_name TEXT,
  card_color TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed_router', 'failed_telegram', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vouchers_batch_id ON public.vouchers(batch_id);
CREATE INDEX idx_vouchers_reseller_id ON public.vouchers(reseller_id);
CREATE INDEX idx_vouchers_package_id ON public.vouchers(package_id);
CREATE INDEX idx_vouchers_username ON public.vouchers(username);
CREATE INDEX idx_vouchers_created_at ON public.vouchers(created_at DESC);

-- 10. Ledger Mutasi Saldo Reseller
CREATE TABLE public.wallet_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_no INT,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  telegram_id BIGINT NOT NULL,
  seller_name TEXT,
  tx_type TEXT NOT NULL CHECK (tx_type IN (
    'voucher_purchase', 'voucher_nonsaldo', 'voucher_failed',
    'topup', 'topdown', 'ppob_purchase', 'refund'
  )),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  voucher_price NUMERIC(14,2) DEFAULT 0,
  markup_amount NUMERIC(14,2) DEFAULT 0,
  balance_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  topup_by TEXT,
  voucher_username TEXT,
  voucher_password TEXT,
  voucher_profile TEXT,
  router_name TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_wallet_tx_legacy_no ON public.wallet_transactions(legacy_no) WHERE legacy_no IS NOT NULL;
CREATE INDEX idx_wallet_tx_reseller_date ON public.wallet_transactions(reseller_id, created_at DESC);
CREATE INDEX idx_wallet_tx_telegram_date ON public.wallet_transactions(telegram_id, created_at DESC);
CREATE INDEX idx_wallet_tx_type_date ON public.wallet_transactions(tx_type, created_at DESC);
CREATE INDEX idx_wallet_tx_created_at ON public.wallet_transactions(created_at DESC);

-- 11. Request Deposit Reseller
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  proof_file_path TEXT,
  approved_amount NUMERIC(14,2),
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deposit_requests_reseller_id ON public.deposit_requests(reseller_id);
CREATE INDEX idx_deposit_requests_status_created ON public.deposit_requests(status, created_at DESC);

-- 12. Transaksi Portal Pulsa / PPOB
CREATE TABLE public.ppob_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id INT,
  trx_id TEXT UNIQUE NOT NULL,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  telegram_id BIGINT NOT NULL,
  product_code TEXT NOT NULL,
  target_number TEXT NOT NULL,
  customer_id TEXT,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'PROCESSED', 'PENDING', 'FAILED')),
  serial_number TEXT DEFAULT '',
  description TEXT,
  source TEXT NOT NULL DEFAULT 'telegram_bot' CHECK (source IN ('telegram_bot', 'manual_web')),
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ppob_tx_legacy_id ON public.ppob_transactions(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX idx_ppob_tx_created_at ON public.ppob_transactions(created_at DESC);
CREATE INDEX idx_ppob_tx_reseller ON public.ppob_transactions(reseller_id);
CREATE INDEX idx_ppob_tx_status ON public.ppob_transactions(status);

CREATE TRIGGER trg_ppob_transactions_updated_at
  BEFORE UPDATE ON public.ppob_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. Counter Harian Anti-Duplikat PPOB
CREATE TABLE public.ppob_daily_counters (
  tx_date DATE NOT NULL,
  telegram_id BIGINT NOT NULL,
  product_code TEXT NOT NULL,
  target_number TEXT NOT NULL,
  tx_count INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tx_date, telegram_id, product_code, target_number)
);

CREATE TRIGGER trg_ppob_daily_counters_updated_at
  BEFORE UPDATE ON public.ppob_daily_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14a. State Machine Percakapan Bot
CREATE TABLE public.bot_user_states (
  telegram_id BIGINT PRIMARY KEY,
  step TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_bot_user_states_updated_at
  BEFORE UPDATE ON public.bot_user_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14b. Idempotency Update Telegram
CREATE TABLE public.telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Log Broadcast Telegram
CREATE TABLE public.broadcast_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_scope TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'photo')),
  content TEXT,
  media_path TEXT,
  total_targets INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_broadcast_logs_created_by ON public.broadcast_logs(created_by);
CREATE INDEX idx_broadcast_logs_created_at ON public.broadcast_logs(created_at DESC);
