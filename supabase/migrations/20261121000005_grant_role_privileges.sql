-- Grant explicit DML & sequence privileges to service_role and authenticated
-- (RLS policies still enforce row-level & RBAC restrictions for authenticated; anon stays locked down)

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Full server-side access for service_role (webhooks, admin actions, migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- Scoped DML grants for authenticated dashboard users (enforced by RLS + RBAC)
-- Internal tables (password_reset_otps, bot_user_states, telegram_processed_updates) remain service_role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.admin_profiles,
  public.routers,
  public.app_settings,
  public.bot_message_templates,
  public.voucher_packages,
  public.resellers,
  public.voucher_batches,
  public.vouchers,
  public.wallet_transactions,
  public.deposit_requests,
  public.ppob_transactions,
  public.ppob_daily_counters,
  public.broadcast_logs
TO authenticated;

GRANT SELECT ON public.auth_audit_logs TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
