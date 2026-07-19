
-- Enums
CREATE TYPE public.app_role AS ENUM ('owner','member');
CREATE TYPE public.program_type AS ENUM ('section8','lihtc','public_housing','custom');
CREATE TYPE public.application_status AS ENUM ('in_progress','submitted','approved','rejected','withdrawn');
CREATE TYPE public.doc_status AS ENUM ('pending','pass','needs_fixing','flagged');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- programs
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  program_type public.program_type NOT NULL DEFAULT 'custom',
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  link_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT SELECT ON public.programs TO anon; -- renters need to read program via token (filtered by RPC/token-based)
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- team_members
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, invited_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helper: does the current user own or belong to this program?
CREATE OR REPLACE FUNCTION public.can_access_program(_program_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = _program_id AND p.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
      WHERE tm.program_id = _program_id AND tm.user_id = auth.uid()
  );
$$;

-- Program access policies
CREATE POLICY "manager reads own/team programs" ON public.programs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.can_access_program(id));
CREATE POLICY "manager writes own programs" ON public.programs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- Anon may read a program row only by knowing its link_token; enforced at query time via .eq('link_token', ...)
-- but RLS must still allow SELECT to anon for this to work — narrow to selecting only via token.
-- We'll use a security-definer RPC below rather than broad anon SELECT.
REVOKE SELECT ON public.programs FROM anon;

-- Team member policies
CREATE POLICY "team read for owner/self" ON public.team_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY "team write for owner" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid()));

-- applications
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  applicant JSONB NOT NULL DEFAULT '{}'::jsonb,
  co_applicants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.application_status NOT NULL DEFAULT 'in_progress',
  language TEXT NOT NULL DEFAULT 'en',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  packet_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager reads program applications" ON public.applications FOR SELECT TO authenticated
  USING (public.can_access_program(program_id));
CREATE POLICY "manager updates program applications" ON public.applications FOR UPDATE TO authenticated
  USING (public.can_access_program(program_id)) WITH CHECK (public.can_access_program(program_id));

-- documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL, -- id of the requirement in programs.requirements
  doc_type TEXT NOT NULL,
  applicant_index INT NOT NULL DEFAULT 0, -- 0=primary, 1+=co-applicant
  storage_path TEXT,
  ocr_text TEXT,
  status public.doc_status NOT NULL DEFAULT 'pending',
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  exif_flag BOOLEAN NOT NULL DEFAULT false,
  exif_reason TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager reads program documents" ON public.documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND public.can_access_program(a.program_id)));

-- Rate limits table (server-tracked, per token / IP)
CREATE TABLE public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
-- No anon/auth grants: rate limits are only touched by server functions using service role or via RPCs

-- Public RPCs for renter (no auth): use SECURITY DEFINER, filter strictly by token.

-- Get program + applicant scaffolding by application session_token
CREATE OR REPLACE FUNCTION public.renter_get_application(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _row RECORD; _prog RECORD;
BEGIN
  SELECT * INTO _row FROM public.applications WHERE session_token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id, name, program_type, requirements INTO _prog FROM public.programs WHERE id = _row.program_id;
  RETURN jsonb_build_object(
    'application', to_jsonb(_row),
    'program', to_jsonb(_prog),
    'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.documents d WHERE d.application_id = _row.id), '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.renter_get_application(TEXT) TO anon, authenticated;

-- Start (or get) an application for a program link_token
CREATE OR REPLACE FUNCTION public.renter_start_application(_program_token TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid UUID; _tok TEXT;
BEGIN
  SELECT id INTO _pid FROM public.programs WHERE link_token = _program_token;
  IF _pid IS NULL THEN RAISE EXCEPTION 'invalid program token'; END IF;
  INSERT INTO public.applications (program_id) VALUES (_pid) RETURNING session_token INTO _tok;
  RETURN _tok;
END; $$;
GRANT EXECUTE ON FUNCTION public.renter_start_application(TEXT) TO anon, authenticated;

-- Look up a program by link_token (for the landing page a manager shares)
CREATE OR REPLACE FUNCTION public.renter_get_program(_token TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(p) - 'owner_id' FROM public.programs p WHERE link_token = _token;
$$;
GRANT EXECUTE ON FUNCTION public.renter_get_program(TEXT) TO anon, authenticated;

-- Save applicant info + language
CREATE OR REPLACE FUNCTION public.renter_update_applicant(_token TEXT, _applicant JSONB, _co JSONB, _lang TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.applications
    SET applicant = COALESCE(_applicant, applicant),
        co_applicants = COALESCE(_co, co_applicants),
        language = COALESCE(_lang, language),
        last_activity_at = now()
    WHERE session_token = _token;
$$;
GRANT EXECUTE ON FUNCTION public.renter_update_applicant(TEXT,JSONB,JSONB,TEXT) TO anon, authenticated;

-- Upsert a document check result (renter-side, no image bytes in DB)
CREATE OR REPLACE FUNCTION public.renter_save_document(
  _token TEXT, _requirement_id TEXT, _doc_type TEXT, _applicant_index INT,
  _storage_path TEXT, _ocr_text TEXT, _status TEXT, _issues JSONB,
  _exif_flag BOOLEAN, _exif_reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _aid UUID; _did UUID;
BEGIN
  SELECT id INTO _aid FROM public.applications WHERE session_token = _token;
  IF _aid IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  -- Sliding rate limit: max 60 doc-writes per token per hour
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 hours';
  INSERT INTO public.rate_limits (key, window_start, count)
    VALUES ('doc:'||_token, date_trunc('hour', now()), 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = public.rate_limits.count + 1;
  IF (SELECT count FROM public.rate_limits WHERE key='doc:'||_token AND window_start=date_trunc('hour',now())) > 60 THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO public.documents (application_id, requirement_id, doc_type, applicant_index,
    storage_path, ocr_text, status, issues, exif_flag, exif_reason)
    VALUES (_aid, _requirement_id, _doc_type, _applicant_index,
            _storage_path, _ocr_text, _status::public.doc_status, COALESCE(_issues,'[]'::jsonb), _exif_flag, _exif_reason)
    ON CONFLICT DO NOTHING
    RETURNING id INTO _did;

  -- Since no unique constraint yet, delete older entries for the same slot
  DELETE FROM public.documents
    WHERE application_id = _aid AND requirement_id = _requirement_id
      AND applicant_index = _applicant_index AND id <> COALESCE(_did, id);

  UPDATE public.applications SET last_activity_at = now() WHERE id = _aid;
  RETURN _did;
END; $$;
GRANT EXECUTE ON FUNCTION public.renter_save_document(TEXT,TEXT,TEXT,INT,TEXT,TEXT,TEXT,JSONB,BOOLEAN,TEXT) TO anon, authenticated;

-- Mark application submitted with a packet path
CREATE OR REPLACE FUNCTION public.renter_submit(_token TEXT, _packet_path TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.applications
    SET status = 'submitted', submitted_at = now(), packet_path = _packet_path, last_activity_at = now()
    WHERE session_token = _token;
$$;
GRANT EXECUTE ON FUNCTION public.renter_submit(TEXT,TEXT) TO anon, authenticated;

-- Start over: return storage paths so client can delete them, then wipe rows
CREATE OR REPLACE FUNCTION public.renter_start_over(_token TEXT)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _aid UUID; _paths TEXT[];
BEGIN
  SELECT id INTO _aid FROM public.applications WHERE session_token = _token;
  IF _aid IS NULL THEN RETURN ARRAY[]::TEXT[]; END IF;
  SELECT array_agg(storage_path) INTO _paths FROM public.documents
    WHERE application_id = _aid AND storage_path IS NOT NULL;
  DELETE FROM public.documents WHERE application_id = _aid;
  UPDATE public.applications SET status='in_progress', submitted_at=NULL, packet_path=NULL, last_activity_at=now()
    WHERE id = _aid;
  RETURN COALESCE(_paths, ARRAY[]::TEXT[]);
END; $$;
GRANT EXECUTE ON FUNCTION public.renter_start_over(TEXT) TO anon, authenticated;

-- Manager decides an application: sets status and returns storage paths to be deleted
CREATE OR REPLACE FUNCTION public.manager_decide_application(_app_id UUID, _new_status TEXT)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _paths TEXT[]; _prog UUID;
BEGIN
  SELECT program_id INTO _prog FROM public.applications WHERE id = _app_id;
  IF _prog IS NULL OR NOT public.can_access_program(_prog) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _new_status NOT IN ('approved','rejected','withdrawn') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  SELECT array_agg(storage_path) INTO _paths FROM public.documents
    WHERE application_id = _app_id AND storage_path IS NOT NULL;
  UPDATE public.applications SET status = _new_status::public.application_status, decided_at = now()
    WHERE id = _app_id;
  UPDATE public.documents SET storage_path = NULL WHERE application_id = _app_id;
  RETURN COALESCE(_paths, ARRAY[]::TEXT[]);
END; $$;
GRANT EXECUTE ON FUNCTION public.manager_decide_application(UUID,TEXT) TO authenticated;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, contact_email, org_name)
    VALUES (NEW.id, COALESCE(NEW.email,''), COALESCE(NEW.raw_user_meta_data->>'org_name',''))
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tr_programs_updated BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
