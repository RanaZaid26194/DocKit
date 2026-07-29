
-- application_snapshots: signed hash of the packet at each state transition
CREATE TABLE public.application_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  state public.application_status NOT NULL,
  packet_sha256 TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.application_snapshots TO authenticated;
GRANT ALL ON public.application_snapshots TO service_role;
ALTER TABLE public.application_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots read for program members" ON public.application_snapshots
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.applications a
          WHERE a.id = application_id
          AND public.can_access_program(a.program_id))
);
CREATE POLICY "snapshots insert for program members" ON public.application_snapshots
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.applications a
          WHERE a.id = application_id
          AND public.can_access_program(a.program_id))
);

-- Renter-side snapshot insert via SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.renter_record_snapshot(
  _token TEXT, _state public.application_status, _sha TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _app_id UUID;
BEGIN
  SELECT id INTO _app_id FROM public.applications WHERE session_token = _token;
  IF _app_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  INSERT INTO public.application_snapshots (application_id, state, packet_sha256)
  VALUES (_app_id, _state, _sha);
END; $$;
GRANT EXECUTE ON FUNCTION public.renter_record_snapshot(TEXT, public.application_status, TEXT) TO anon, authenticated;

-- Delegated caseworker pre-check: array of requirement ids the manager has
-- already satisfied off-platform (e.g. ID already on file).
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS pre_marked_requirements TEXT[] NOT NULL DEFAULT '{}';
