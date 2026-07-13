-- SIGA EDUCA — Menu 12: Projeto Olímpico
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, students, user_can_access_school()
-- App hoje: siga_olimpiadas + siga_olimpiada_inscricoes

-- =========================================================
-- 1) Olimpíadas  →  public.olympiads
-- =========================================================

CREATE TABLE IF NOT EXISTS public.olympiads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text,
  starts_on date NOT NULL,
  registration_deadline date NOT NULL,
  extras text,
  logo_url text,
  status text NOT NULL DEFAULT 'Inscrições',
  icon text DEFAULT 'emoji_events',
  icon_bg text DEFAULT 'bg-primary-fixed',
  icon_color text DEFAULT 'text-primary',
  badge_class text DEFAULT 'bg-green-100 text-green-700',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT olympiads_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT olympiads_dates_chk CHECK (registration_deadline >= starts_on),
  CONSTRAINT olympiads_status_chk CHECK (
    status = ANY (ARRAY[
      'Inscrições'::text,
      'Em andamento'::text,
      'Encerrada'::text,
      'Resultados'::text
    ])
  )
);

COMMENT ON TABLE public.olympiads IS 'Projeto Olímpico — olimpíadas por escola';
COMMENT ON COLUMN public.olympiads.registration_deadline IS 'dataLimite no app';
COMMENT ON COLUMN public.olympiads.logo_url IS 'URL da logo (evitar data URL gigante no banco)';

CREATE INDEX IF NOT EXISTS olympiads_school_idx ON public.olympiads (school_id);
CREATE INDEX IF NOT EXISTS olympiads_school_status_idx ON public.olympiads (school_id, status);
CREATE INDEX IF NOT EXISTS olympiads_deadline_idx ON public.olympiads (school_id, registration_deadline);

DROP TRIGGER IF EXISTS trg_olympiads_updated ON public.olympiads;
CREATE TRIGGER trg_olympiads_updated
  BEFORE UPDATE ON public.olympiads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_olympiad_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.website := NULLIF(btrim(COALESCE(NEW.website, '')), '');
  NEW.extras := NULLIF(btrim(COALESCE(NEW.extras, '')), '');
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_olympiads_sync ON public.olympiads;
CREATE TRIGGER trg_olympiads_sync
  BEFORE INSERT OR UPDATE ON public.olympiads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_olympiad_fields();

ALTER TABLE public.olympiads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS olympiads_select ON public.olympiads;
DROP POLICY IF EXISTS olympiads_insert ON public.olympiads;
DROP POLICY IF EXISTS olympiads_update ON public.olympiads;
DROP POLICY IF EXISTS olympiads_delete ON public.olympiads;

CREATE POLICY olympiads_select ON public.olympiads
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY olympiads_insert ON public.olympiads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY olympiads_update ON public.olympiads
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY olympiads_delete ON public.olympiads
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.olympiads TO authenticated;

-- =========================================================
-- 2) Inscrições  →  public.olympiad_entries
-- =========================================================

CREATE TABLE IF NOT EXISTS public.olympiad_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  olympiad_id uuid NOT NULL REFERENCES public.olympiads(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  student_class_code text,
  origin text NOT NULL DEFAULT 'admin',
  registered_on date NOT NULL DEFAULT CURRENT_DATE,
  medal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT olympiad_entries_name_not_blank CHECK (length(btrim(student_name)) > 0),
  CONSTRAINT olympiad_entries_origin_chk CHECK (
    origin = ANY (ARRAY['admin'::text, 'portal'::text])
  ),
  CONSTRAINT olympiad_entries_medal_chk CHECK (
    medal IS NULL OR medal = ANY (ARRAY['ouro'::text, 'prata'::text, 'bronze'::text])
  )
);

COMMENT ON TABLE public.olympiad_entries IS 'Inscrições de alunos em olimpíadas';
COMMENT ON COLUMN public.olympiad_entries.medal IS 'ouro | prata | bronze | null';
COMMENT ON COLUMN public.olympiad_entries.origin IS 'admin | portal';

CREATE UNIQUE INDEX IF NOT EXISTS olympiad_entries_unique_student
  ON public.olympiad_entries (olympiad_id, student_id)
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS olympiad_entries_school_idx ON public.olympiad_entries (school_id);
CREATE INDEX IF NOT EXISTS olympiad_entries_olympiad_idx ON public.olympiad_entries (olympiad_id);
CREATE INDEX IF NOT EXISTS olympiad_entries_student_idx ON public.olympiad_entries (student_id);
CREATE INDEX IF NOT EXISTS olympiad_entries_medal_idx ON public.olympiad_entries (school_id, medal);

DROP TRIGGER IF EXISTS trg_olympiad_entries_updated ON public.olympiad_entries;
CREATE TRIGGER trg_olympiad_entries_updated
  BEFORE UPDATE ON public.olympiad_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_olympiad_entry_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ol public.olympiads%ROWTYPE;
  st public.students%ROWTYPE;
BEGIN
  SELECT * INTO ol FROM public.olympiads WHERE id = NEW.olympiad_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Olimpíada % não encontrada', NEW.olympiad_id;
  END IF;
  NEW.school_id := ol.school_id;
  NEW.student_name := btrim(NEW.student_name);
  NEW.medal := NULLIF(lower(btrim(COALESCE(NEW.medal, ''))), '');

  IF NEW.student_id IS NOT NULL THEN
    SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aluno % não encontrado', NEW.student_id;
    END IF;
    IF st.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Aluno e olimpíada de escolas diferentes';
    END IF;
    NEW.student_name := COALESCE(NULLIF(NEW.student_name, ''), st.full_name);
    NEW.student_class_code := COALESCE(
      NULLIF(btrim(COALESCE(NEW.student_class_code, '')), ''),
      st.class_code
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_olympiad_entries_sync ON public.olympiad_entries;
CREATE TRIGGER trg_olympiad_entries_sync
  BEFORE INSERT OR UPDATE ON public.olympiad_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_olympiad_entry_fields();

ALTER TABLE public.olympiad_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS olympiad_entries_select ON public.olympiad_entries;
DROP POLICY IF EXISTS olympiad_entries_insert ON public.olympiad_entries;
DROP POLICY IF EXISTS olympiad_entries_update ON public.olympiad_entries;
DROP POLICY IF EXISTS olympiad_entries_delete ON public.olympiad_entries;

CREATE POLICY olympiad_entries_select ON public.olympiad_entries
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY olympiad_entries_insert ON public.olympiad_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY olympiad_entries_update ON public.olympiad_entries
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY olympiad_entries_delete ON public.olympiad_entries
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.olympiad_entries TO authenticated;

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('olympiads', 'olympiad_entries');
