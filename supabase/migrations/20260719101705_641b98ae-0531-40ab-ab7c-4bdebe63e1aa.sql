-- In-app manager note (short text renter sees on their next visit).
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS manager_note TEXT;

-- Replace the retention purge job so it honors programs.retention_days.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dockit-purge-stale') THEN
    PERFORM cron.unschedule('dockit-purge-stale');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realdoor-purge-stale') THEN
    PERFORM cron.unschedule('realdoor-purge-stale');
  END IF;
END $$;

SELECT cron.schedule(
  'dockit-purge-stale',
  '0 3 * * *',
  $$
    UPDATE public.documents d
      SET storage_path = NULL
      FROM public.applications a
      JOIN public.programs p ON p.id = a.program_id
      WHERE d.application_id = a.id
        AND d.storage_path IS NOT NULL
        AND a.status = 'in_progress'
        AND a.last_activity_at < now() - (COALESCE(p.retention_days, 90) || ' days')::interval;
  $$
);