ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS checkout_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;
