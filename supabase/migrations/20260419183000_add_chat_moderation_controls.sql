ALTER TABLE public.public_chat_messages
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'participant_controls'
  ) THEN
    EXECUTE 'ALTER TABLE public.participant_controls ADD COLUMN IF NOT EXISTS moderator BOOLEAN NOT NULL DEFAULT FALSE';
    EXECUTE 'DROP FUNCTION IF EXISTS public.get_my_participant_controls()';

    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.can_moderate_public_chat(_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
        SELECT
          COALESCE(
            (SELECT moderator FROM public.participant_controls WHERE user_id = _user_id),
            FALSE
          )
          OR public.has_role(_user_id, 'admin')
      $inner$;
    $function$;

    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.get_my_participant_controls()
      RETURNS TABLE (
        checkout_blocked BOOLEAN,
        public_chat_blocked BOOLEAN,
        moderator BOOLEAN,
        block_reason TEXT
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
        SELECT
          COALESCE(controls.checkout_blocked, FALSE) AS checkout_blocked,
          COALESCE(controls.public_chat_blocked, FALSE) AS public_chat_blocked,
          COALESCE(controls.moderator, FALSE) AS moderator,
          controls.block_reason
        FROM (SELECT auth.uid() AS current_user_id) AS auth_context
        LEFT JOIN public.participant_controls AS controls
          ON controls.user_id = auth_context.current_user_id
      $inner$;
    $function$;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.hide_public_chat_message(_message_id UUID)
RETURNS TABLE (
  id UUID,
  is_hidden BOOLEAN,
  hidden_at TIMESTAMPTZ,
  hidden_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id UUID := auth.uid();
BEGIN
  IF requester_id IS NULL OR NOT public.can_moderate_public_chat(requester_id) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para ocultar mensagens do chat.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.public_chat_messages
  SET
    is_hidden = TRUE,
    hidden_at = COALESCE(public_chat_messages.hidden_at, NOW()),
    hidden_by = COALESCE(public_chat_messages.hidden_by, requester_id)
  WHERE public_chat_messages.id = _message_id
  RETURNING
    public_chat_messages.id,
    public_chat_messages.is_hidden,
    public_chat_messages.hidden_at,
    public_chat_messages.hidden_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem nao encontrada.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_public_chat_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_public_chat_message(UUID) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'can_moderate_public_chat'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.can_moderate_public_chat(UUID) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_moderate_public_chat(UUID) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'get_my_participant_controls'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_my_participant_controls() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_participant_controls() TO authenticated';
  END IF;
END
$$;
