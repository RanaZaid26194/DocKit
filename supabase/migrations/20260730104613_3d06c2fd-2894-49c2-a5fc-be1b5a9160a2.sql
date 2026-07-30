-- Program-level defaults for caseworker pre-marked requirements
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS default_pre_marked TEXT[] NOT NULL DEFAULT '{}';

-- Threaded messaging per application
CREATE TABLE IF NOT EXISTS public.application_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('manager','renter')),
  author_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_messages_app_idx
  ON public.application_messages (application_id, created_at);

GRANT SELECT, INSERT ON public.application_messages TO authenticated;
GRANT ALL ON public.application_messages TO service_role;

ALTER TABLE public.application_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages read for program members"
  ON public.application_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = application_messages.application_id
      AND public.can_access_program(a.program_id)
  ));

CREATE POLICY "messages insert for program members"
  ON public.application_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = application_messages.application_id
      AND public.can_access_program(a.program_id)
  ));

-- Renter side: token-scoped RPCs (no auth session involved)
CREATE OR REPLACE FUNCTION public.renter_list_messages(_token TEXT)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]'::jsonb)
  FROM public.application_messages m
  JOIN public.applications a ON a.id = m.application_id
  WHERE a.session_token = _token;
$$;

CREATE OR REPLACE FUNCTION public.renter_post_message(_token TEXT, _body TEXT, _document_id UUID DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _aid UUID; _mid UUID; _name TEXT;
BEGIN
  SELECT id, COALESCE(applicant->>'name','') INTO _aid, _name
    FROM public.applications WHERE session_token = _token;
  IF _aid IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF length(coalesce(_body,'')) = 0 OR length(_body) > 2000 THEN
    RAISE EXCEPTION 'invalid message';
  END IF;

  -- Sliding rate limit: max 40 renter messages per token per hour
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 hours';
  INSERT INTO public.rate_limits (key, window_start, count)
    VALUES ('msg:'||_token, date_trunc('hour', now()), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = public.rate_limits.count + 1;
  IF (SELECT count FROM public.rate_limits WHERE key='msg:'||_token AND window_start=date_trunc('hour',now())) > 40 THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO public.application_messages (application_id, document_id, author_role, author_name, body)
    VALUES (_aid, _document_id, 'renter', _name, _body)
    RETURNING id INTO _mid;

  UPDATE public.applications SET last_activity_at = now() WHERE id = _aid;
  RETURN _mid;
END; $$;

-- Seed new applications with the program's default pre-marked requirements
CREATE OR REPLACE FUNCTION public.renter_start_application(_program_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _pid UUID; _tok TEXT; _def TEXT[];
BEGIN
  SELECT id, default_pre_marked INTO _pid, _def
    FROM public.programs WHERE link_token = _program_token;
  IF _pid IS NULL THEN RAISE EXCEPTION 'invalid program token'; END IF;
  INSERT INTO public.applications (program_id, pre_marked_requirements)
    VALUES (_pid, COALESCE(_def, '{}'::TEXT[]))
    RETURNING session_token INTO _tok;
  RETURN _tok;
END; $$;