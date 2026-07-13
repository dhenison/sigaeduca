-- SIGA EDUCA — Menu 8: Ocorrências
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, students, classes, user_can_access_school()
-- App hoje: localStorage siga_occurrences (+ espelho parcial em siga_student_occurrences)

-- =========================================================
-- Ocorrências  →  public.occurrences
-- =========================================================

CREATE TABLE IF NOT EXISTS public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_code text,
  occurrence_type text NOT NULL,
  status text NOT NULL DEFAULT 'Em Análise',
  description text NOT NULL,
  occurrence_date date NOT NULL DEFAULT CURRENT_DATE,
  occurrence_time text,
  return_date date,
  involved_people jsonb NOT NULL DEFAULT '[]'::jsonb,
  treatment_notes text,
  treated_at timestamptz,
  treated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_by_name text,
  registered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  attendance_call_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occurrences_student_name_not_blank CHECK (length(btrim(student_name)) > 0),
  CONSTRAINT occurrences_description_not_blank CHECK (length(btrim(description)) > 0),
  CONSTRAINT occurrences_type_not_blank CHECK (length(btrim(occurrence_type)) > 0),
  CONSTRAINT occurrences_status_chk CHECK (
    status = ANY (ARRAY[
      'Em Análise'::text,
      'Em Analise'::text,
      'Tratado'::text,
      'Resolvida'::text
    ])
  ),
  CONSTRAINT occurrences_source_chk CHECK (
    source = ANY (ARRAY['manual'::text, 'frequencia'::text, 'sistema'::text])
  )
);

COMMENT ON TABLE public.occurrences IS 'Ocorrências disciplinares / pedagógicas por escola';
COMMENT ON COLUMN public.occurrences.occurrence_type IS 'Ex.: Atraso, Evasão, Indisciplina, Bullying, Suspensão, Agressão Física';
COMMENT ON COLUMN public.occurrences.status IS 'Em Análise | Tratado | Resolvida (legado)';
COMMENT ON COLUMN public.occurrences.involved_people IS 'Lista de envolvidos (array JSON)';
COMMENT ON COLUMN public.occurrences.source IS 'manual | frequencia (evasão automática) | sistema';
COMMENT ON COLUMN public.occurrences.return_date IS 'Data de retorno (suspensão)';

CREATE INDEX IF NOT EXISTS occurrences_school_idx
  ON public.occurrences (school_id);

CREATE INDEX IF NOT EXISTS occurrences_school_date_idx
  ON public.occurrences (school_id, occurrence_date DESC);

CREATE INDEX IF NOT EXISTS occurrences_student_idx
  ON public.occurrences (student_id);

CREATE INDEX IF NOT EXISTS occurrences_class_code_idx
  ON public.occurrences (school_id, class_code);

CREATE INDEX IF NOT EXISTS occurrences_type_idx
  ON public.occurrences (school_id, occurrence_type);

CREATE INDEX IF NOT EXISTS occurrences_status_idx
  ON public.occurrences (school_id, status);

DROP TRIGGER IF EXISTS trg_occurrences_updated ON public.occurrences;
CREATE TRIGGER trg_occurrences_updated
  BEFORE UPDATE ON public.occurrences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_occurrence_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  cl public.classes%ROWTYPE;
BEGIN
  NEW.student_name := btrim(NEW.student_name);
  NEW.description := btrim(NEW.description);
  NEW.occurrence_type := btrim(NEW.occurrence_type);
  NEW.class_code := NULLIF(btrim(COALESCE(NEW.class_code, '')), '');

  IF NEW.student_id IS NOT NULL THEN
    SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aluno % não encontrado', NEW.student_id;
    END IF;
    IF st.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Aluno pertence a outra escola';
    END IF;
    NEW.student_name := COALESCE(NULLIF(NEW.student_name, ''), st.full_name);
    NEW.class_code := COALESCE(NEW.class_code, st.class_code);
    NEW.class_id := COALESCE(NEW.class_id, st.class_id);
  ELSIF NEW.student_name IS NOT NULL THEN
    SELECT id INTO NEW.student_id
    FROM public.students
    WHERE school_id = NEW.school_id
      AND lower(full_name) = lower(NEW.student_name)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO cl FROM public.classes WHERE id = NEW.class_id;
    IF FOUND THEN
      IF cl.school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Turma pertence a outra escola';
      END IF;
      NEW.class_code := COALESCE(NEW.class_code, cl.code);
    END IF;
  ELSIF NEW.class_code IS NOT NULL THEN
    SELECT id INTO NEW.class_id
    FROM public.classes
    WHERE school_id = NEW.school_id
      AND lower(code) = lower(NEW.class_code)
    ORDER BY year_label DESC
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.registered_by := COALESCE(NEW.registered_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_occurrences_sync ON public.occurrences;
CREATE TRIGGER trg_occurrences_sync
  BEFORE INSERT OR UPDATE ON public.occurrences
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_occurrence_fields();

ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occurrences_select ON public.occurrences;
DROP POLICY IF EXISTS occurrences_insert ON public.occurrences;
DROP POLICY IF EXISTS occurrences_update ON public.occurrences;
DROP POLICY IF EXISTS occurrences_delete ON public.occurrences;

CREATE POLICY occurrences_select ON public.occurrences
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY occurrences_insert ON public.occurrences
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY occurrences_update ON public.occurrences
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY occurrences_delete ON public.occurrences
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.occurrences TO authenticated;

-- =========================================================
-- Exemplo (opcional)
-- =========================================================
-- INSERT INTO public.occurrences (
--   school_id, student_name, class_code, occurrence_type,
--   description, occurrence_date, occurrence_time, status, source
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'Aluno Exemplo',
--   'M1MNM01',
--   'Indisciplina',
--   'Descrição da ocorrência.',
--   CURRENT_DATE,
--   '10:30',
--   'Em Análise',
--   'manual'
-- );

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'occurrences';
