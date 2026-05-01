DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_cron'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  ELSE
    RAISE NOTICE 'pg_cron extension is not available in this database; skipping checkout cleanup schedule.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'cron'
  ) THEN
    PERFORM cron.schedule(
      'expire-stale-checkout-reservations',
      '* * * * *',
      'SELECT public.expire_stale_checkout_reservations()'
    );
  ELSE
    RAISE NOTICE 'cron schema is not available; skipping checkout cleanup schedule.';
  END IF;
END;
$$;

SELECT public.expire_stale_checkout_reservations();
