-- ============================================================
-- SalikurVouch: Row Level Security (RLS) Policies & Storage
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_admin_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.admin_profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION private.current_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_admin_role() TO authenticated, service_role;

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppob_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppob_daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_logs ENABLE ROW LEVEL SECURITY;

-- 1. admin_profiles
CREATE POLICY admin_profiles_select ON public.admin_profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT private.current_admin_role()) IN ('super_admin', 'admin')
  );

CREATE POLICY admin_profiles_insert ON public.admin_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY admin_profiles_update_admin ON public.admin_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY admin_profiles_delete ON public.admin_profiles
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) = 'super_admin');

-- 2. auth_audit_logs
CREATE POLICY auth_audit_logs_select ON public.auth_audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 3. routers
CREATE POLICY routers_select ON public.routers
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY routers_insert ON public.routers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY routers_update ON public.routers
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY routers_delete ON public.routers
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 4. app_settings
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY app_settings_insert ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY app_settings_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 5. bot_message_templates
CREATE POLICY bot_message_templates_select ON public.bot_message_templates
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY bot_message_templates_insert ON public.bot_message_templates
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY bot_message_templates_update ON public.bot_message_templates
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY bot_message_templates_delete ON public.bot_message_templates
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 6. voucher_packages
CREATE POLICY voucher_packages_select ON public.voucher_packages
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY voucher_packages_insert ON public.voucher_packages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY voucher_packages_update ON public.voucher_packages
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

CREATE POLICY voucher_packages_delete ON public.voucher_packages
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 7. resellers
CREATE POLICY resellers_select ON public.resellers
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY resellers_insert ON public.resellers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY resellers_update ON public.resellers
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY resellers_delete ON public.resellers
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 8. voucher_batches
CREATE POLICY voucher_batches_select ON public.voucher_batches
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY voucher_batches_insert ON public.voucher_batches
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY voucher_batches_update ON public.voucher_batches
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY voucher_batches_delete ON public.voucher_batches
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 9. vouchers
CREATE POLICY vouchers_select ON public.vouchers
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY vouchers_insert ON public.vouchers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY vouchers_update ON public.vouchers
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY vouchers_delete ON public.vouchers
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 10. wallet_transactions
CREATE POLICY wallet_transactions_select ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY wallet_transactions_insert ON public.wallet_transactions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY wallet_transactions_update ON public.wallet_transactions
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

-- 11. deposit_requests
CREATE POLICY deposit_requests_select ON public.deposit_requests
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY deposit_requests_insert ON public.deposit_requests
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY deposit_requests_update ON public.deposit_requests
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

-- 12. ppob_transactions
CREATE POLICY ppob_transactions_select ON public.ppob_transactions
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY ppob_transactions_insert ON public.ppob_transactions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY ppob_transactions_update ON public.ppob_transactions
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY ppob_transactions_delete ON public.ppob_transactions
  FOR DELETE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin'));

-- 13. ppob_daily_counters
CREATE POLICY ppob_daily_counters_select ON public.ppob_daily_counters
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY ppob_daily_counters_insert ON public.ppob_daily_counters
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY ppob_daily_counters_update ON public.ppob_daily_counters
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

-- 14. broadcast_logs
CREATE POLICY broadcast_logs_select ON public.broadcast_logs
  FOR SELECT TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY broadcast_logs_insert ON public.broadcast_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

CREATE POLICY broadcast_logs_update ON public.broadcast_logs
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'))
  WITH CHECK ((SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator'));

-- Storage Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('broadcast-media', 'broadcast-media', FALSE, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('deposit-proofs', 'deposit-proofs', FALSE, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('broadcast-media', 'deposit-proofs')
    AND (SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator')
  );

CREATE POLICY storage_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('broadcast-media', 'deposit-proofs')
    AND (SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator')
  );

CREATE POLICY storage_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('broadcast-media', 'deposit-proofs')
    AND (SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator')
  )
  WITH CHECK (
    bucket_id IN ('broadcast-media', 'deposit-proofs')
    AND (SELECT private.current_admin_role()) IN ('super_admin', 'admin', 'operator')
  );

CREATE POLICY storage_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('broadcast-media', 'deposit-proofs')
    AND (SELECT private.current_admin_role()) IN ('super_admin', 'admin')
  );
