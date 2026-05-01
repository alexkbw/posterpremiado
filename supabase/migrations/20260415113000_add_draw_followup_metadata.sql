ALTER TABLE public.draws
  ADD COLUMN IF NOT EXISTS winner_ticket_number INTEGER,
  ADD COLUMN IF NOT EXISTS winner_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_contact_status TEXT,
  ADD COLUMN IF NOT EXISTS winner_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prize_delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS prize_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draw_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'draws_winner_contact_status_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.draws
      ADD CONSTRAINT draws_winner_contact_status_check
      CHECK (
        winner_contact_status IS NULL
        OR winner_contact_status IN ('pending', 'contacted', 'unreachable', 'resolved')
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'draws_prize_delivery_status_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.draws
      ADD CONSTRAINT draws_prize_delivery_status_check
      CHECK (
        prize_delivery_status IS NULL
        OR prize_delivery_status IN ('pending', 'processing', 'delivered')
      );
  END IF;
END
$$;

WITH first_winner AS (
  SELECT DISTINCT ON (participants.draw_id)
    participants.draw_id,
    participants.payment_id,
    participants.ticket_number
  FROM public.draw_participants AS participants
  WHERE participants.is_winner = TRUE
  ORDER BY participants.draw_id, participants.position, participants.created_at, participants.id
)
UPDATE public.draws AS draws
SET
  winner_ticket_number = COALESCE(draws.winner_ticket_number, first_winner.ticket_number),
  winner_payment_id = COALESCE(draws.winner_payment_id, first_winner.payment_id),
  winner_contact_status = COALESCE(draws.winner_contact_status, 'pending'),
  prize_delivery_status = COALESCE(draws.prize_delivery_status, 'pending')
FROM first_winner
WHERE draws.id = first_winner.draw_id;

CREATE INDEX IF NOT EXISTS draws_followup_status_idx
  ON public.draws (status, winner_contact_status, prize_delivery_status, draw_date DESC);
