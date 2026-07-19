-- DocKit consolidated schema. Hand-maintained snapshot of the migrations
-- in supabase/migrations/. Run this once against a fresh Supabase project
-- to bring it to the current schema. Regenerate whenever a new migration
-- lands.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

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

-- programs (includes retention_days from a later migration)
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  program_type public.program_type NOT NULL DEFAULT 'custom',
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  link_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 365),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
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

-- Access helper
CREATE OR REPLACE FUNCTION public.can_access_program(_program_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = _program_id AND p.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.program_id = _program_id AND tm.user_id = auth.uid());
$$;

CREATE POLICY "manager reads own/team programs" ON public.programs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.can_access_program(id));
CREATE POLICY "manager writes own programs" ON public.programs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "team read for owner/self" ON public.team_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY "team write for owner" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.programs p WHERE p.id = program_id AND p.owner_id = auth.uid()));

-- applications (includes manager_note from a later migration)
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  applicant JSONB NOT NULL DEFAULT '{}'::jsonb,
  co_applicants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.application_status NOT NULL DEFAULT 'in_progress',
  language TEXT NOT NULL DEFAULT 'en',
  manager_note TEXT,
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
  requirement_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  applicant_index INT NOT NULL DEFAULT 0,
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

-- Rate limits (service-role only)
CREATE TABLE public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;

-- Renter RPCs and manager decide RPC live in the migration file
-- 20260719075457_*.sql; copy them verbatim after running the schema above.
-- (Kept there so this file stays a schema snapshot rather than a bundle.)

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.programs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;

-- Nightly retention purge (per-program retention_days)
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

-- Auto-create profile on signup + auto-link team invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, contact_email, org_name)
    VALUES (NEW.id, COALESCE(NEW.email,''), COALESCE(NEW.raw_user_meta_data->>'org_name',''))
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.team_members SET user_id = NEW.id
    WHERE user_id IS NULL AND lower(invited_email) = lower(COALESCE(NEW.email, ''));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tr_programs_updated BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
