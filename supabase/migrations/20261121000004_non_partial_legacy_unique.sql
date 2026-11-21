-- Add non-partial UNIQUE constraints so PostgREST ON CONFLICT (legacy_no)/(legacy_id) works natively.
-- PostgreSQL treats NULL values as distinct in standard UNIQUE constraints.
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT uq_wallet_transactions_legacy_no UNIQUE (legacy_no);

ALTER TABLE public.ppob_transactions
  ADD CONSTRAINT uq_ppob_transactions_legacy_id UNIQUE (legacy_id);
