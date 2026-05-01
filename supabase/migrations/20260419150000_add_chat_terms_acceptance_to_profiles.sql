ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_terms_accepted_at TIMESTAMPTZ;
