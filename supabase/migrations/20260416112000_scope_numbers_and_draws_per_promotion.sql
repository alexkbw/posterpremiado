WITH promotion_scope AS (
  SELECT
    promotions.contest_code,
    MIN(promotions.id::text)::uuid AS promotion_id,
    COUNT(*) AS promotion_count
  FROM public.promotions AS promotions
  GROUP BY promotions.contest_code
)
UPDATE public.draws AS draws
SET promotion_id = promotion_scope.promotion_id
FROM promotion_scope
WHERE draws.promotion_id IS NULL
  AND draws.contest_code = promotion_scope.contest_code
  AND promotion_scope.promotion_count = 1;

DROP INDEX IF EXISTS public.promotion_numbers_contest_ticket_idx;

CREATE UNIQUE INDEX IF NOT EXISTS promotion_numbers_promotion_ticket_idx
  ON public.promotion_numbers (promotion_id, ticket_number);

CREATE INDEX IF NOT EXISTS promotion_numbers_promotion_idx
  ON public.promotion_numbers (promotion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_promotion_status_idx
  ON public.payments (promotion_id, status, payment_date, created_at);

CREATE INDEX IF NOT EXISTS draws_promotion_draw_date_idx
  ON public.draws (promotion_id, draw_date DESC);

CREATE OR REPLACE FUNCTION public.assign_promotion_numbers(_payment_id UUID)
RETURNS TABLE(ticket_number INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available_numbers INTEGER := 0;
  contest_ref TEXT;
  current_count INTEGER := 0;
  generated_number INTEGER;
  inserted_rows INTEGER := 0;
  max_attempts INTEGER := 50000;
  numbers_needed INTEGER := 0;
  payment_status_value TEXT;
  payment_user_id UUID;
  promotion_number_count INTEGER := 10;
  promotion_ref UUID;
  try_count INTEGER := 0;
BEGIN
  SELECT
    payments.contest_code,
    payments.promotion_id,
    COALESCE(payments.poster_quantity, promotions.number_package_size, 1),
    COALESCE(payments.status, ''),
    payments.user_id
  INTO
    contest_ref,
    promotion_ref,
    promotion_number_count,
    payment_status_value,
    payment_user_id
  FROM public.payments AS payments
  JOIN public.promotions AS promotions
    ON promotions.id = payments.promotion_id
  WHERE payments.id = _payment_id
  FOR UPDATE;

  IF promotion_ref IS NULL OR payment_user_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento nao encontrado ou sem promocao vinculada.';
  END IF;

  contest_ref := COALESCE(NULLIF(BTRIM(contest_ref), ''), promotion_ref::text, _payment_id::text);

  IF LOWER(payment_status_value) NOT IN ('paid', 'completed', 'approved') THEN
    RETURN QUERY
    SELECT assigned.ticket_number
    FROM public.promotion_numbers AS assigned
    WHERE assigned.payment_id = _payment_id
    ORDER BY assigned.ticket_number;
    RETURN;
  END IF;

  promotion_number_count := CASE
    WHEN promotion_number_count BETWEEN 1 AND 9999 THEN promotion_number_count
    ELSE 1
  END;

  PERFORM pg_advisory_xact_lock(9471, hashtext(promotion_ref::text));

  SELECT COUNT(*)
  INTO current_count
  FROM public.promotion_numbers
  WHERE payment_id = _payment_id;

  numbers_needed := promotion_number_count - current_count;

  IF numbers_needed <= 0 THEN
    RETURN QUERY
    SELECT assigned.ticket_number
    FROM public.promotion_numbers AS assigned
    WHERE assigned.payment_id = _payment_id
    ORDER BY assigned.ticket_number;
    RETURN;
  END IF;

  SELECT 9999 - COUNT(*)
  INTO available_numbers
  FROM public.promotion_numbers
  WHERE promotion_id = promotion_ref;

  IF available_numbers < numbers_needed THEN
    RAISE EXCEPTION 'Nao ha numeros promocionais suficientes disponiveis para esta promocao.';
  END IF;

  max_attempts := GREATEST(numbers_needed * 200, max_attempts);

  WHILE current_count < promotion_number_count LOOP
    IF try_count >= max_attempts THEN
      RAISE EXCEPTION 'Nao foi possivel reservar numeros suficientes para esta promocao.';
    END IF;

    try_count := try_count + 1;
    generated_number := FLOOR(RANDOM() * 9999 + 1)::INTEGER;

    INSERT INTO public.promotion_numbers (
      contest_code,
      payment_id,
      promotion_id,
      ticket_number,
      user_id
    )
    VALUES (
      contest_ref,
      _payment_id,
      promotion_ref,
      generated_number,
      payment_user_id
    )
    ON CONFLICT (promotion_id, ticket_number) DO NOTHING;

    GET DIAGNOSTICS inserted_rows = ROW_COUNT;

    IF inserted_rows > 0 THEN
      current_count := current_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT assigned.ticket_number
  FROM public.promotion_numbers AS assigned
  WHERE assigned.payment_id = _payment_id
  ORDER BY assigned.ticket_number;
END;
$$;

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
  normalized_contest_code TEXT;
  normalized_payment_id UUID := gen_random_uuid();
  normalized_poster_quantity INTEGER := 1;
  reservation_deadline TIMESTAMPTZ := NOW() + INTERVAL '15 minutes';
  remaining_numbers INTEGER := 0;
BEGIN
  normalized_poster_quantity := CASE
    WHEN COALESCE(_poster_quantity, 1) BETWEEN 1 AND 9999 THEN COALESCE(_poster_quantity, 1)
    ELSE 1
  END;

  IF _promotion_id IS NULL THEN
    RAISE EXCEPTION 'Promocao obrigatoria para reservar o checkout.';
  END IF;

  normalized_contest_code := COALESCE(NULLIF(BTRIM(_contest_code), ''), _promotion_id::text, normalized_payment_id::text);

  PERFORM pg_advisory_xact_lock(9471, hashtext(_promotion_id::text));

  SELECT COUNT(*)
  INTO assigned_numbers
  FROM public.promotion_numbers
  WHERE promotion_id = _promotion_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN COALESCE(payments.poster_quantity, 1) BETWEEN 1 AND 9999 THEN COALESCE(payments.poster_quantity, 1)
      ELSE 1
    END
  ), 0)
  INTO active_pending_numbers
  FROM public.payments AS payments
  WHERE payments.promotion_id = _promotion_id
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
    RAISE EXCEPTION 'Nao ha numeros promocionais suficientes disponiveis para esta promocao.';
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
    normalized_contest_code,
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
