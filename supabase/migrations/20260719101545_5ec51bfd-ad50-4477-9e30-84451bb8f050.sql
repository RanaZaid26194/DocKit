-- Add configurable retention window per program (default 90 days)
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 365);

-- Backfill team_members.user_id when the invited email matches a new auth user.
-- Runs from the existing handle_new_user() trigger via a wrapping function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, contact_email, org_name)
    VALUES (NEW.id, COALESCE(NEW.email,''), COALESCE(NEW.raw_user_meta_data->>'org_name',''))
    ON CONFLICT (id) DO NOTHING;

  -- Auto-link any pending team invitations for this email address.
  UPDATE public.team_members
    SET user_id = NEW.id
    WHERE user_id IS NULL
      AND lower(invited_email) = lower(COALESCE(NEW.email, ''));

  RETURN NEW;
END;
$$;

-- Enable Realtime on the tables the manager UI subscribes to.
ALTER PUBLICATION supabase_realtime ADD TABLE public.programs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;