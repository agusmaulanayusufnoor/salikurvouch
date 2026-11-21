-- ==============================================================================
-- Migration: 20261121000006_auth_otp_challenges.sql
-- Purpose: Stateless Telegram 2FA OTP challenges & password-reset cooldown tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.auth_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login_otp', 'password_reset')),
  otp_hash text NOT NULL,
  telegram_chat_id bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_email_purpose_created
  ON public.auth_otp_challenges (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_expires_at
  ON public.auth_otp_challenges (expires_at);

ALTER TABLE public.auth_otp_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.auth_otp_challenges FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_otp_challenges TO service_role;
