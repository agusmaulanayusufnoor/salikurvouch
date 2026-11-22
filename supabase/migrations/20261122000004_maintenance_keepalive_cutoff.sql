-- ============================================================
-- SalikurVouch: Keep-Alive, Free-Tier Storage Monitor & Cutoff Preview
-- ============================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS last_keepalive_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_cutoff_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.rpc_get_database_storage_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_db_size BIGINT;
  v_storage_size BIGINT;
  v_storage_count BIGINT;
  v_buckets JSONB;
  v_tables JSONB;
  v_settings RECORD;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_size;

  SELECT
    COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0),
    COUNT(*)
  INTO v_storage_size, v_storage_count
  FROM storage.objects;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'bucket_id', b.id,
        'object_count', COALESCE(o.obj_count, 0),
        'size_bytes', COALESCE(o.total_bytes, 0)
      )
      ORDER BY b.id
    ),
    '[]'::jsonb
  )
  INTO v_buckets
  FROM storage.buckets b
  LEFT JOIN (
    SELECT
      bucket_id,
      COUNT(*) AS obj_count,
      COALESCE(SUM(COALESCE((metadata->>'size')::BIGINT, 0)), 0) AS total_bytes
    FROM storage.objects
    GROUP BY bucket_id
  ) o ON o.bucket_id = b.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'table_name', t.table_name,
        'total_bytes', t.total_bytes,
        'row_estimate', t.row_estimate
      )
      ORDER BY t.total_bytes DESC
    ),
    '[]'::jsonb
  )
  INTO v_tables
  FROM (
    SELECT
      c.relname AS table_name,
      pg_total_relation_size(c.oid) AS total_bytes,
      GREATEST(COALESCE(s.n_live_tup, 0), 0)::BIGINT AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  ) t;

  SELECT last_keepalive_at, last_backup_at, last_cutoff_at
  INTO v_settings
  FROM public.app_settings
  WHERE id = 1;

  RETURN jsonb_build_object(
    'db_size_bytes', v_db_size,
    'db_limit_bytes', 524288000,
    'storage_size_bytes', v_storage_size,
    'storage_limit_bytes', 1073741824,
    'storage_object_count', v_storage_count,
    'storage_buckets', v_buckets,
    'tables', v_tables,
    'last_keepalive_at', v_settings.last_keepalive_at,
    'last_backup_at', v_settings.last_backup_at,
    'last_cutoff_at', v_settings.last_cutoff_at,
    'checked_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_preview_cutoff_data(p_months INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_cutoff_date DATE;
  v_wallet_tx BIGINT;
  v_vouchers BIGINT;
  v_voucher_batches BIGINT;
  v_ppob_tx BIGINT;
  v_ppob_counters BIGINT;
  v_deposits BIGINT;
  v_audit_logs BIGINT;
  v_broadcast_logs BIGINT;
  v_tg_updates BIGINT;
  v_reset_otps BIGINT;
  v_bot_states BIGINT;
  v_total BIGINT;
BEGIN
  IF p_months NOT IN (6, 12) THEN
    RAISE EXCEPTION 'INVALID_RETENTION_MONTHS: only 6 or 12 months are allowed';
  END IF;

  v_cutoff := NOW() - make_interval(months => p_months);
  v_cutoff_date := (v_cutoff AT TIME ZONE 'Asia/Jakarta')::DATE;

  SELECT COUNT(*) INTO v_wallet_tx FROM public.wallet_transactions WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_vouchers FROM public.vouchers WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_voucher_batches FROM public.voucher_batches WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_ppob_tx FROM public.ppob_transactions WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_ppob_counters FROM public.ppob_daily_counters WHERE tx_date < v_cutoff_date;
  SELECT COUNT(*) INTO v_deposits FROM public.deposit_requests WHERE status <> 'pending' AND created_at < v_cutoff;
  SELECT COUNT(*) INTO v_audit_logs FROM public.auth_audit_logs WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_broadcast_logs FROM public.broadcast_logs WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_tg_updates FROM public.telegram_processed_updates WHERE processed_at < v_cutoff;
  SELECT COUNT(*) INTO v_reset_otps FROM public.password_reset_otps WHERE created_at < v_cutoff;
  SELECT COUNT(*) INTO v_bot_states FROM public.bot_user_states WHERE expires_at < NOW();

  v_total :=
    v_wallet_tx + v_vouchers + v_voucher_batches + v_ppob_tx +
    v_ppob_counters + v_deposits + v_audit_logs + v_broadcast_logs +
    v_tg_updates + v_reset_otps + v_bot_states;

  RETURN jsonb_build_object(
    'retain_months', p_months,
    'cutoff_at', v_cutoff,
    'total_rows_to_delete', v_total,
    'breakdown', jsonb_build_array(
      jsonb_build_object('table', 'wallet_transactions', 'label', 'Riwayat Mutasi Saldo & Voucher', 'rows', v_wallet_tx),
      jsonb_build_object('table', 'vouchers', 'label', 'Detail Kode Voucher', 'rows', v_vouchers),
      jsonb_build_object('table', 'voucher_batches', 'label', 'Arsip Batch Voucher', 'rows', v_voucher_batches),
      jsonb_build_object('table', 'ppob_transactions', 'label', 'Riwayat Transaksi PPOB', 'rows', v_ppob_tx),
      jsonb_build_object('table', 'ppob_daily_counters', 'label', 'Counter Harian PPOB', 'rows', v_ppob_counters),
      jsonb_build_object('table', 'deposit_requests', 'label', 'Request Deposit (Non-Pending)', 'rows', v_deposits),
      jsonb_build_object('table', 'auth_audit_logs', 'label', 'Log Audit Login', 'rows', v_audit_logs),
      jsonb_build_object('table', 'broadcast_logs', 'label', 'Log Broadcast Telegram', 'rows', v_broadcast_logs),
      jsonb_build_object('table', 'telegram_processed_updates', 'label', 'Log Idempotency Telegram', 'rows', v_tg_updates),
      jsonb_build_object('table', 'password_reset_otps', 'label', 'OTP Reset Password Lama', 'rows', v_reset_otps),
      jsonb_build_object('table', 'bot_user_states', 'label', 'State Bot Kedaluwarsa', 'rows', v_bot_states)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_database_storage_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_database_storage_stats() TO service_role;

REVOKE ALL ON FUNCTION public.rpc_preview_cutoff_data(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_preview_cutoff_data(INT) TO service_role;
