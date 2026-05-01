ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_error TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_notes TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfillment_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS numbers_assigned_at TIMESTAMPTZ;

UPDATE public.payments
SET fulfillment_status = CASE
  WHEN LOWER(COALESCE(status, '')) = 'refunded' THEN 'refunded_external'
  WHEN LOWER(COALESCE(status, '')) IN ('cancelled', 'charged_back', 'failed', 'rejected') THEN 'resolved'
  WHEN LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'approved')
    AND COALESCE((
      SELECT COUNT(*)
      FROM public.promotion_numbers AS promotion_numbers
      WHERE promotion_numbers.payment_id = payments.id
    ), 0) >= COALESCE(payments.poster_quantity, 1) THEN 'fulfilled'
  WHEN LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'approved') THEN 'manual_review'
  ELSE 'pending'
END
WHERE fulfillment_status IS NULL
   OR BTRIM(fulfillment_status) = '';

UPDATE public.payments
SET numbers_assigned_at = COALESCE(payment_date, created_at)
WHERE numbers_assigned_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.promotion_numbers AS promotion_numbers
    WHERE promotion_numbers.payment_id = payments.id
  );

ALTER TABLE public.payments
  ALTER COLUMN fulfillment_status SET DEFAULT 'pending';

UPDATE public.payments
SET fulfillment_status = 'pending'
WHERE fulfillment_status IS NULL
   OR BTRIM(fulfillment_status) = '';

ALTER TABLE public.payments
  ALTER COLUMN fulfillment_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_fulfillment_status_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_fulfillment_status_check
      CHECK (
        fulfillment_status IN (
          'pending',
          'fulfilled',
          'manual_review',
          'refund_pending_external',
          'resolved',
          'refunded_external'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS payments_fulfillment_status_created_at_idx
  ON public.payments (fulfillment_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_checkout_payment(
  _amount NUMERIC,
  _contest_code TEXT,
  _poster_quantity INTEGER,
  _promotion_id UUID,
  _user_id UUID,
  _week_reference TEXT,
  _payment_method TEXT DEFAULT 'mercado_pago_checkout_pro',
  _attributed_at TIMESTAMPTZ DEFAULT NULL,
  _attribution_campaign TEXT DEFAULT NULL,
  _attribution_content TEXT DEFAULT NULL,
  _attribution_id TEXT DEFAULT NULL,
  _attribution_landing_path TEXT DEFAULT NULL,
  _attribution_medium TEXT DEFAULT NULL,
  _attribution_referrer_host TEXT DEFAULT NULL,
  _attribution_source TEXT DEFAULT NULL
)
RETURNS TABLE(
  available_numbers INTEGER,
  payment_id UUID,
  reservation_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_pending_numbers INTEGER := 0;
  assigned_numbers INTEGER := 0;
  contest_ref TEXT;
  normalized_payment_id UUID := gen_random_uuid();
  normalized_poster_quantity INTEGER := 1;
  reservation_deadline TIMESTAMPTZ := NOW() + INTERVAL '15 minutes';
  remaining_numbers INTEGER := 0;
BEGIN
  normalized_poster_quantity := CASE
    WHEN COALESCE(_poster_quantity, 1) BETWEEN 1 AND 9999 THEN COALESCE(_poster_quantity, 1)
    ELSE 1
  END;

  contest_ref := COALESCE(NULLIF(BTRIM(_contest_code), ''), _promotion_id::text, normalized_payment_id::text);

  PERFORM pg_advisory_xact_lock(9471, hashtext(contest_ref));

  SELECT COUNT(*)
  INTO assigned_numbers
  FROM public.promotion_numbers
  WHERE contest_code = contest_ref;

  SELECT COALESCE(SUM(
    CASE
      WHEN COALESCE(payments.poster_quantity, 1) BETWEEN 1 AND 9999 THEN COALESCE(payments.poster_quantity, 1)
      ELSE 1
    END
  ), 0)
  INTO active_pending_numbers
  FROM public.payments AS payments
  WHERE payments.contest_code = contest_ref
    AND LOWER(COALESCE(payments.status, '')) = 'pending'
    AND (
      payments.transaction_id IS NOT NULL
      OR (
        payments.reservation_expires_at IS NOT NULL
        AND payments.reservation_expires_at > NOW()
      )
    );

  remaining_numbers := 9999 - assigned_numbers - active_pending_numbers;

  IF remaining_numbers < normalized_poster_quantity THEN
    RAISE EXCEPTION 'Nao ha numeros promocionais suficientes disponiveis para este concurso.';
  END IF;

  INSERT INTO public.payments (
    amount,
    attributed_at,
    attribution_campaign,
    attribution_content,
    attribution_id,
    attribution_landing_path,
    attribution_medium,
    attribution_referrer_host,
    attribution_source,
    contest_code,
    fulfillment_status,
    id,
    payment_date,
    payment_method,
    poster_quantity,
    promotion_id,
    reservation_expires_at,
    status,
    user_id,
    week_reference
  )
  VALUES (
    _amount,
    _attributed_at,
    _attribution_campaign,
    _attribution_content,
    _attribution_id,
    _attribution_landing_path,
    _attribution_medium,
    _attribution_referrer_host,
    _attribution_source,
    contest_ref,
    'pending',
    normalized_payment_id,
    NOW(),
    COALESCE(NULLIF(BTRIM(_payment_method), ''), 'mercado_pago_checkout_pro'),
    normalized_poster_quantity,
    _promotion_id,
    reservation_deadline,
    'pending',
    _user_id,
    _week_reference
  );

  RETURN QUERY
  SELECT
    remaining_numbers - normalized_poster_quantity,
    normalized_payment_id,
    reservation_deadline;
END;
$$;
