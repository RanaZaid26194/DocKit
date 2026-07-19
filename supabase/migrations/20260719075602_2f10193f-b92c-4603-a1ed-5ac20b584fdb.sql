
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role or SECURITY DEFINER functions may touch it.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Storage policies for the private "documents" bucket.
-- Paths are laid out as: <session_token>/<application_id>/<doc_id>.<ext>
-- Anon may insert/read/delete only when the path starts with a valid session_token.
CREATE OR REPLACE FUNCTION public.storage_path_token_is_valid(_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.session_token = split_part(_name, '/', 1)
  );
$$;
GRANT EXECUTE ON FUNCTION public.storage_path_token_is_valid(TEXT) TO anon, authenticated;

CREATE POLICY "renter insert own docs" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'documents' AND public.storage_path_token_is_valid(name));
CREATE POLICY "renter read own docs" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'documents' AND public.storage_path_token_is_valid(name));
CREATE POLICY "renter delete own docs" ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'documents' AND public.storage_path_token_is_valid(name));

-- Manager read access to any doc under their program
CREATE POLICY "manager read program docs" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents' AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.session_token = split_part(name, '/', 1)
        AND public.can_access_program(a.program_id)
    )
  );
CREATE POLICY "manager delete program docs" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents' AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.session_token = split_part(name, '/', 1)
        AND public.can_access_program(a.program_id)
    )
  );

-- Nightly purge job: applications idle >= 90 days, wipe images
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'dockit-purge-stale',
  '0 3 * * *',
  $$UPDATE public.documents d SET storage_path = NULL
      WHERE d.storage_path IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.applications a WHERE a.id = d.application_id
          AND a.last_activity_at < now() - interval '90 days'
      );$$
);
