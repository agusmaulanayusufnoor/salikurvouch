-- ============================================================
-- Migration: 20261122000001_multi_server_foundation.sql
-- Purpose: Add multi-server tenant root (`servers`), RBAC (`admin_server_access`),
--          backfill existing Server 1 data, add `server_id` columns & indexes.
-- ============================================================

-- 1. Tenant root table: public.servers (1 server = 1 Router MikroTik + 1 Bot Telegram + PPOB config)
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name TEXT NOT NULL,
  router_id UUID UNIQUE REFERENCES public.routers(id) ON DELETE SET NULL,
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
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_servers_updated_at
  BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Optional per-server admin RBAC table
CREATE TABLE IF NOT EXISTS public.admin_server_access (
  admin_id UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_server_access_server_id
  ON public.admin_server_access(server_id);

-- 3. Seed Server 1 from existing default router + app_settings (idempotent)
INSERT INTO public.servers (
  slug,
  name,
  router_id,
  bot_token_encrypted,
  bot_username,
  bot_mode,
  webhook_secret,
  owner_username,
  owner_telegram_id,
  max_deposit_amount,
  low_balance_threshold,
  ppob_enabled,
  ppob_markup_small_pct,
  ppob_markup_large_pct,
  ppob_markup_threshold,
  ppob_proxy_url,
  is_default,
  is_active
)
SELECT
  'server1',
  COALESCE(r.name, 'SalikurNet'),
  r.id,
  s.bot_token_encrypted,
  s.bot_username,
  COALESCE(s.bot_mode, 'saldo_only'),
  s.webhook_secret,
  s.owner_username,
  s.owner_telegram_id,
  COALESCE(s.max_deposit_amount, 1000000),
  COALESCE(s.low_balance_threshold, 10000),
  COALESCE(s.ppob_enabled, TRUE),
  COALESCE(s.ppob_markup_small_pct, 3.00),
  COALESCE(s.ppob_markup_large_pct, 1.00),
  COALESCE(s.ppob_markup_threshold, 100000),
  s.ppob_proxy_url,
  TRUE,
  TRUE
FROM (SELECT * FROM public.app_settings WHERE id = 1) s
LEFT JOIN LATERAL (
  SELECT id, name FROM public.routers ORDER BY is_default DESC, created_at ASC LIMIT 1
) r ON TRUE
ON CONFLICT (slug) DO NOTHING;

-- Fallback seed if app_settings was empty
INSERT INTO public.servers (slug, name, is_default, is_active)
SELECT 'server1', 'SalikurNet', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.servers WHERE slug = 'server1');

-- 4. Helper function returning the default server_id (for zero-downtime column defaults)
CREATE OR REPLACE FUNCTION public.default_server_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.servers ORDER BY is_default DESC, created_at ASC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.default_server_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_server_id() TO authenticated, service_role;

-- 5. Add server_id column to all tenant-scoped tables with default = server1
ALTER TABLE public.voucher_packages
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.voucher_batches
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.ppob_transactions
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.ppob_daily_counters
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.bot_message_templates
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.bot_user_states
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;
ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE;

-- Backfill all existing rows to Server 1
DO $$
DECLARE
  v_srv1 UUID;
BEGIN
  SELECT id INTO v_srv1 FROM public.servers WHERE slug = 'server1' LIMIT 1;

  UPDATE public.voucher_packages SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.resellers SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.voucher_batches SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.vouchers SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.wallet_transactions SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.deposit_requests SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.ppob_transactions SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.ppob_daily_counters SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.bot_message_templates SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.bot_user_states SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.telegram_processed_updates SET server_id = v_srv1 WHERE server_id IS NULL;
  UPDATE public.broadcast_logs SET server_id = v_srv1 WHERE server_id IS NULL;
END $$;

-- Enforce NOT NULL + DEFAULT public.default_server_id()
ALTER TABLE public.voucher_packages ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.resellers ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.voucher_batches ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.wallet_transactions ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.deposit_requests ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.ppob_transactions ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.ppob_daily_counters ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.bot_message_templates ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.bot_user_states ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.telegram_processed_updates ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;
ALTER TABLE public.broadcast_logs ALTER COLUMN server_id SET DEFAULT public.default_server_id(), ALTER COLUMN server_id SET NOT NULL;

-- 6. Performance indexes scoped by server_id
CREATE INDEX IF NOT EXISTS idx_voucher_packages_server ON public.voucher_packages(server_id, mode, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_resellers_server_status ON public.resellers(server_id, status);
CREATE INDEX IF NOT EXISTS idx_voucher_batches_server_created ON public.voucher_batches(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_server_created ON public.vouchers(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_server_created ON public.wallet_transactions(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_req_server_status ON public.deposit_requests(server_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppob_tx_server_created ON public.ppob_transactions(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_server_created ON public.broadcast_logs(server_id, created_at DESC);

-- 7. RLS + Explicit Postgres 17 role grants for servers & admin_server_access
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_server_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.servers, public.admin_server_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servers, public.admin_server_access TO authenticated, service_role;

CREATE POLICY servers_select ON public.servers
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY servers_insert ON public.servers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY servers_update ON public.servers
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY servers_delete ON public.servers
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) = 'super_admin');

CREATE POLICY admin_server_access_select ON public.admin_server_access
  FOR SELECT TO authenticated
  USING (
    admin_id = (SELECT auth.uid())
    OR (SELECT private.current_admin_role()) IN ('super_admin', 'admin')
  );

CREATE POLICY admin_server_access_manage ON public.admin_server_access
  FOR ALL TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));
