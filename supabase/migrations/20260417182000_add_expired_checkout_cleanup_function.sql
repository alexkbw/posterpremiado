CREATE INDEX IF NOT EXISTS payments_expired_checkout_cleanup_idx
  ON public.payments (reservation_expires_at)
  WHERE status = 'pending'
    AND transaction_id IS NULL
    AND reservation_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.expire_stale_checkout_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER := 0;
BEGIN
  UPDATE public.payments
  SET
    checkout_preference_id = NULL,
    checkout_url = NULL,
    fulfillment_error = COALESCE(
      NULLIF(BTRIM(fulfillment_error), ''),
      'Reserva expirada automaticamente sem confirmacao de pagamento.'
    ),
    fulfillment_notes = COALESCE(
      NULLIF(BTRIM(fulfillment_notes), ''),
      'Tentativa encerrada automaticamente apos o vencimento da reserva.'
    ),
    fulfillment_status = 'resolved',
    reservation_expires_at = NULL,
    status = 'failed'
  WHERE LOWER(COALESCE(status, '')) = 'pending'
    AND transaction_id IS NULL
    AND reservation_expires_at IS NOT NULL
    AND reservation_expires_at <= NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
