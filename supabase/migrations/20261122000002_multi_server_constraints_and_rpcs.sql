-- ============================================================
-- Migration: 20261122000002_multi_server_constraints_and_rpcs.sql
-- Purpose: Scope unique/PK constraints per server_id & add server-scoped
--          atomic RPCs (*_v2) with backward-compatible v1 wrappers.
-- ============================================================

-- 1. Resellers: UNIQUE(telegram_id) -> UNIQUE(server_id, telegram_id)
ALTER TABLE public.resellers DROP CONSTRAINT IF EXISTS resellers_telegram_id_key;
ALTER TABLE public.resellers
  ADD CONSTRAINT uq_resellers_server_telegram UNIQUE (server_id, telegram_id);

-- 2. Bot message templates: PK(key) -> PK(server_id, key)
ALTER TABLE public.bot_message_templates DROP CONSTRAINT IF EXISTS bot_message_templates_pkey;
ALTER TABLE public.bot_message_templates
  ADD CONSTRAINT bot_message_templates_pkey PRIMARY KEY (server_id, key);

-- 3. Bot user states: PK(telegram_id) -> PK(server_id, telegram_id)
ALTER TABLE public.bot_user_states DROP CONSTRAINT IF EXISTS bot_user_states_pkey;
ALTER TABLE public.bot_user_states
  ADD CONSTRAINT bot_user_states_pkey PRIMARY KEY (server_id, telegram_id);

-- 4. Telegram processed updates: PK(update_id) -> PK(server_id, update_id)
ALTER TABLE public.telegram_processed_updates DROP CONSTRAINT IF EXISTS telegram_processed_updates_pkey;
ALTER TABLE public.telegram_processed_updates
  ADD CONSTRAINT telegram_processed_updates_pkey PRIMARY KEY (server_id, update_id);

-- 5. PPOB daily counters: PK includes server_id
ALTER TABLE public.ppob_daily_counters DROP CONSTRAINT IF EXISTS ppob_daily_counters_pkey;
ALTER TABLE public.ppob_daily_counters
  ADD CONSTRAINT ppob_daily_counters_pkey PRIMARY KEY (server_id, tx_date, telegram_id, product_code, target_number);

-- 6. Helper to seed default Telegram templates for any new server
CREATE OR REPLACE FUNCTION public.seed_server_default_templates(p_server_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.bot_message_templates (server_id, key, label, content) VALUES
    (p_server_id, 'welcome_unregistered', 'Sambutan User Baru (Belum Terdaftar)', 'Halo <b>{{username}}</b>! Selamat datang di Bot Voucher & PPOB.\nSilakan ketik /daftar untuk mendaftar sebagai reseller atau /help untuk bantuan.'),
    (p_server_id, 'welcome_registered', 'Sambutan Reseller Terdaftar', 'Halo <b>{{username}}</b>! Saldo Anda saat ini: <b>Rp {{saldo}}</b>.\nKetik /menu untuk beli voucher atau /isipulsa untuk transaksi PPOB.'),
    (p_server_id, 'info_promo', 'Informasi & Promo', 'Hubungi admin untuk informasi deposit saldo dan bantuan teknis.'),
    (p_server_id, 'voucher_footer', 'Footer Pesan Voucher', 'Terima kasih telah bertransaksi. Login hotspot melalui <code>http://{{dns_name}}</code>.'),
    (p_server_id, 'deposit_instruction', 'Instruksi Deposit', 'Silakan transfer sesuai nominal lalu kirim foto bukti transfer dengan caption:\n<code>#konfirmasi deposit {{amount}}</code>')
  ON CONFLICT (server_id, key) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.seed_server_default_templates(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_server_default_templates(UUID) TO authenticated, service_role;

-- 7. Server-scoped atomic RPCs (v2) + backward-compatible v1 wrappers

CREATE OR REPLACE FUNCTION public.rpc_reserve_balance_v2(
  p_server_id UUID,
  p_telegram_id BIGINT,
  p_amount NUMERIC,
  p_tx_type TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  transaction_id BIGINT,
  reseller_id UUID,
  balance_before NUMERIC,
  balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_reseller public.resellers%ROWTYPE;
  v_balance_after NUMERIC(14,2);
  v_tx_id BIGINT;
  v_qty INT;
BEGIN
  v_server_id := COALESCE(p_server_id, public.default_server_id());

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be >= 0';
  END IF;

  IF p_tx_type NOT IN ('voucher_purchase', 'voucher_nonsaldo', 'ppob_purchase') THEN
    RAISE EXCEPTION 'INVALID_TX_TYPE: %', p_tx_type;
  END IF;

  SELECT * INTO v_reseller
  FROM public.resellers
  WHERE server_id = v_server_id
    AND telegram_id = p_telegram_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESELLER_NOT_FOUND';
  END IF;

  IF v_reseller.status <> 'active' THEN
    RAISE EXCEPTION 'RESELLER_INACTIVE: %', v_reseller.status;
  END IF;

  IF v_reseller.balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: balance=% required=%', v_reseller.balance, p_amount;
  END IF;

  v_balance_after := v_reseller.balance - p_amount;
  v_qty := GREATEST(COALESCE((p_meta->>'quantity')::INT, 1), 1);

  UPDATE public.resellers
  SET
    balance = v_balance_after,
    vouchers_sold = CASE
      WHEN p_tx_type IN ('voucher_purchase', 'voucher_nonsaldo')
      THEN vouchers_sold + v_qty
      ELSE vouchers_sold
    END,
    updated_at = NOW()
  WHERE id = v_reseller.id;

  INSERT INTO public.wallet_transactions (
    server_id,
    reseller_id,
    telegram_id,
    seller_name,
    tx_type,
    amount,
    voucher_price,
    markup_amount,
    balance_before,
    balance_after,
    voucher_username,
    voucher_password,
    voucher_profile,
    router_name,
    status,
    notes
  ) VALUES (
    v_server_id,
    v_reseller.id,
    v_reseller.telegram_id,
    v_reseller.username,
    p_tx_type,
    -p_amount,
    COALESCE((p_meta->>'voucher_price')::NUMERIC, p_amount),
    COALESCE((p_meta->>'markup_amount')::NUMERIC, 0),
    v_reseller.balance,
    v_balance_after,
    p_meta->>'voucher_username',
    p_meta->>'voucher_password',
    p_meta->>'voucher_profile',
    p_meta->>'router_name',
    COALESCE(p_meta->>'status', 'pending'),
    p_meta->>'notes'
  )
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_tx_id, v_reseller.id, v_reseller.balance, v_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reserve_balance(
  p_telegram_id BIGINT,
  p_amount NUMERIC,
  p_tx_type TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  transaction_id BIGINT,
  reseller_id UUID,
  balance_before NUMERIC,
  balance_after NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM public.rpc_reserve_balance_v2(
    public.default_server_id(),
    p_telegram_id,
    p_amount,
    p_tx_type,
    p_meta
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_refund_balance(
  p_tx_id BIGINT,
  p_reason TEXT DEFAULT 'Automatic rollback'
)
RETURNS TABLE (
  refund_tx_id BIGINT,
  reseller_id UUID,
  refunded_amount NUMERIC,
  balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_orig public.wallet_transactions%ROWTYPE;
  v_reseller public.resellers%ROWTYPE;
  v_refund_amount NUMERIC(14,2);
  v_balance_after NUMERIC(14,2);
  v_refund_tx_id BIGINT;
BEGIN
  SELECT * INTO v_orig
  FROM public.wallet_transactions
  WHERE id = p_tx_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TX_NOT_FOUND: %', p_tx_id;
  END IF;

  IF v_orig.status = 'refunded' THEN
    RAISE EXCEPTION 'TX_ALREADY_REFUNDED: %', p_tx_id;
  END IF;

  IF v_orig.amount >= 0 THEN
    RAISE EXCEPTION 'TX_NOT_DEBIT: %', p_tx_id;
  END IF;

  v_refund_amount := ABS(v_orig.amount);

  SELECT * INTO v_reseller
  FROM public.resellers
  WHERE id = v_orig.reseller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESELLER_NOT_FOUND';
  END IF;

  v_balance_after := v_reseller.balance + v_refund_amount;

  UPDATE public.resellers
  SET
    balance = v_balance_after,
    vouchers_sold = CASE
      WHEN v_orig.tx_type IN ('voucher_purchase', 'voucher_nonsaldo')
      THEN GREATEST(vouchers_sold - 1, 0)
      ELSE vouchers_sold
    END,
    updated_at = NOW()
  WHERE id = v_reseller.id;

  UPDATE public.wallet_transactions
  SET
    status = 'refunded',
    notes = COALESCE(notes || ' | ', '') || 'Refunded: ' || p_reason
  WHERE id = v_orig.id;

  INSERT INTO public.wallet_transactions (
    server_id,
    reseller_id,
    telegram_id,
    seller_name,
    tx_type,
    amount,
    voucher_price,
    markup_amount,
    balance_before,
    balance_after,
    voucher_username,
    voucher_profile,
    router_name,
    status,
    notes
  ) VALUES (
    v_orig.server_id,
    v_reseller.id,
    v_reseller.telegram_id,
    v_reseller.username,
    'refund',
    v_refund_amount,
    0,
    0,
    v_reseller.balance,
    v_balance_after,
    v_orig.voucher_username,
    v_orig.voucher_profile,
    v_orig.router_name,
    'success',
    'Refund for tx #' || v_orig.id || ': ' || p_reason
  )
  RETURNING id INTO v_refund_tx_id;

  RETURN QUERY SELECT v_refund_tx_id, v_reseller.id, v_refund_amount, v_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_adjust_balance_v2(
  p_server_id UUID,
  p_telegram_id BIGINT,
  p_delta NUMERIC,
  p_tx_type TEXT,
  p_actor TEXT DEFAULT 'admin',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id BIGINT,
  reseller_id UUID,
  balance_before NUMERIC,
  balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_reseller public.resellers%ROWTYPE;
  v_balance_after NUMERIC(14,2);
  v_tx_id BIGINT;
BEGIN
  v_server_id := COALESCE(p_server_id, public.default_server_id());

  IF p_delta = 0 THEN
    RAISE EXCEPTION 'INVALID_DELTA: delta cannot be zero';
  END IF;

  IF p_tx_type NOT IN ('topup', 'topdown', 'refund') THEN
    RAISE EXCEPTION 'INVALID_TX_TYPE: %', p_tx_type;
  END IF;

  IF p_tx_type = 'topup' AND p_delta < 0 THEN
    RAISE EXCEPTION 'INVALID_DELTA: topup delta must be positive';
  END IF;

  IF p_tx_type = 'topdown' AND p_delta > 0 THEN
    RAISE EXCEPTION 'INVALID_DELTA: topdown delta must be negative';
  END IF;

  SELECT * INTO v_reseller
  FROM public.resellers
  WHERE server_id = v_server_id
    AND telegram_id = p_telegram_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESELLER_NOT_FOUND';
  END IF;

  v_balance_after := v_reseller.balance + p_delta;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: resulting balance would be negative (%)', v_balance_after;
  END IF;

  UPDATE public.resellers
  SET
    balance = v_balance_after,
    updated_at = NOW()
  WHERE id = v_reseller.id;

  INSERT INTO public.wallet_transactions (
    server_id,
    reseller_id,
    telegram_id,
    seller_name,
    tx_type,
    amount,
    voucher_price,
    markup_amount,
    balance_before,
    balance_after,
    topup_by,
    status,
    notes
  ) VALUES (
    v_server_id,
    v_reseller.id,
    v_reseller.telegram_id,
    v_reseller.username,
    p_tx_type,
    p_delta,
    0,
    0,
    v_reseller.balance,
    v_balance_after,
    p_actor,
    'success',
    p_notes
  )
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_tx_id, v_reseller.id, v_reseller.balance, v_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_adjust_balance(
  p_telegram_id BIGINT,
  p_delta NUMERIC,
  p_tx_type TEXT,
  p_actor TEXT DEFAULT 'admin',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id BIGINT,
  reseller_id UUID,
  balance_before NUMERIC,
  balance_after NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM public.rpc_adjust_balance_v2(
    public.default_server_id(),
    p_telegram_id,
    p_delta,
    p_tx_type,
    p_actor,
    p_notes
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_next_ppob_counter_v2(
  p_server_id UUID,
  p_tx_date DATE,
  p_telegram_id BIGINT,
  p_product_code TEXT,
  p_target_number TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_count INT;
BEGIN
  v_server_id := COALESCE(p_server_id, public.default_server_id());

  INSERT INTO public.ppob_daily_counters (server_id, tx_date, telegram_id, product_code, target_number, tx_count)
  VALUES (v_server_id, p_tx_date, p_telegram_id, p_product_code, p_target_number, 1)
  ON CONFLICT (server_id, tx_date, telegram_id, product_code, target_number)
  DO UPDATE SET
    tx_count = public.ppob_daily_counters.tx_count + 1,
    updated_at = NOW()
  RETURNING tx_count INTO v_count;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_next_ppob_counter(
  p_tx_date DATE,
  p_telegram_id BIGINT,
  p_product_code TEXT,
  p_target_number TEXT
)
RETURNS INT
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.rpc_next_ppob_counter_v2(
    public.default_server_id(),
    p_tx_date,
    p_telegram_id,
    p_product_code,
    p_target_number
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_reserve_balance_v2(UUID, BIGINT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reserve_balance_v2(UUID, BIGINT, NUMERIC, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_adjust_balance_v2(UUID, BIGINT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_balance_v2(UUID, BIGINT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_next_ppob_counter_v2(UUID, DATE, BIGINT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_next_ppob_counter_v2(UUID, DATE, BIGINT, TEXT, TEXT) TO authenticated, service_role;
