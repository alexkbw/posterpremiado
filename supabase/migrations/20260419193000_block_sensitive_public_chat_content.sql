CREATE OR REPLACE FUNCTION public.guard_public_chat_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requester_id UUID := auth.uid();
  target_user_id UUID := COALESCE(
    NULLIF(to_jsonb(NEW) ->> 'user_id', '')::UUID,
    NULLIF(to_jsonb(NEW) ->> 'sender_id', '')::UUID
  );
  message_body TEXT := BTRIM(
    COALESCE(
      NULLIF(to_jsonb(NEW) ->> 'message', ''),
      NULLIF(to_jsonb(NEW) ->> 'content', ''),
      ''
    )
  );
BEGIN
  IF requester_id IS NOT NULL AND public.has_role(requester_id, 'admin') THEN
    RETURN NEW;
  END IF;

  IF target_user_id IS NOT NULL AND public.is_public_chat_blocked(target_user_id) THEN
    RAISE EXCEPTION 'Seu acesso ao chat publico foi temporariamente bloqueado pela equipe.'
      USING ERRCODE = 'P0001';
  END IF;

  IF message_body <> '' THEN
    IF message_body ~* '(^|[[:space:][:punct:]])((https?:\/\/)|(www\.))\S+'
      OR message_body ~* '(^|[[:space:][:punct:]])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(com|com\.br|net|org|io|me|co|app|site|xyz|info|biz|dev|gg|ly|tv|online|store|blog|link|shop|br)\b'
    THEN
      RAISE EXCEPTION 'Nao e permitido enviar links no chat publico.'
        USING ERRCODE = 'P0001';
    END IF;

    IF message_body ~* '(^|[^0-9])\d{3}\.?\d{3}\.?\d{3}-?\d{2}([^0-9]|$)' THEN
      RAISE EXCEPTION 'Nao e permitido enviar CPF no chat publico.'
        USING ERRCODE = 'P0001';
    END IF;

    IF message_body ~* '(^|[^0-9])(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)9?\d{4}[-\s]?\d{4}([^0-9]|$)' THEN
      RAISE EXCEPTION 'Nao e permitido enviar telefone no chat publico.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
