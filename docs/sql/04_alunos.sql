-- SIGA EDUCA — Menu 4: Alunos
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, user_can_access_school(), e Menu 3 (public.classes)
-- Arquivo anterior: 03_turmas.sql

-- =========================================================
-- ALUNOS  →  public.students
-- Espelha siga_students (sem senha em claro: password_hash)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  codigo_inep text,
  full_name text NOT NULL,
  cpf text,
  serie text,
  class_code text,
  turno text,
  birth_date date,
  age integer,
  email text,
  password_hash text,
  needs_password_set boolean NOT NULL DEFAULT true,
  guardian_name text,
  guardian_contact text,
  school_route text,
  status text NOT NULL DEFAULT 'Ativo',
  attendance_pct numeric(5,2) NOT NULL DEFAULT 100,
  avatar_url text,
  class_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT students_status_chk CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text, 'Transferido'::text])),
  CONSTRAINT students_attendance_chk CHECK (attendance_pct >= 0 AND attendance_pct <= 100),
  CONSTRAINT students_age_chk CHECK (age IS NULL OR (age >= 0 AND age <= 120))
);

COMMENT ON TABLE public.students IS 'Alunos por escola (tenant)';
COMMENT ON COLUMN public.students.codigo_inep IS 'Código INEP do aluno (codigoInep no app)';
COMMENT ON COLUMN public.students.class_code IS 'Código da turma denormalizado (campo turma no app)';
COMMENT ON COLUMN public.students.class_id IS 'FK opcional para public.classes';
COMMENT ON COLUMN public.students.password_hash IS 'Hash da senha do portal do aluno — nunca gravar senha em claro';
COMMENT ON COLUMN public.students.class_history IS 'Histórico de trocas de turma (classHistory no app)';

CREATE INDEX IF NOT EXISTS students_school_idx ON public.students (school_id);
CREATE INDEX IF NOT EXISTS students_class_idx ON public.students (class_id);
CREATE INDEX IF NOT EXISTS students_name_idx ON public.students (school_id, lower(full_name));
CREATE INDEX IF NOT EXISTS students_status_idx ON public.students (school_id, status);
CREATE INDEX IF NOT EXISTS students_class_code_idx ON public.students (school_id, class_code);

-- Unicidade parcial (só quando o valor existe)
CREATE UNIQUE INDEX IF NOT EXISTS students_school_cpf_unique
  ON public.students (school_id, cpf)
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_school_inep_unique
  ON public.students (school_id, codigo_inep)
  WHERE codigo_inep IS NOT NULL AND btrim(codigo_inep) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_school_email_unique
  ON public.students (school_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- Mantém class_code / serie / turno alinhados à turma quando class_id muda
CREATE OR REPLACE FUNCTION public.sync_student_class_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c public.classes%ROWTYPE;
BEGIN
  NEW.updated_at := now();
  NEW.full_name := btrim(NEW.full_name);
  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF NEW.cpf = '' THEN NEW.cpf := NULL; END IF;
  END IF;
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO c FROM public.classes WHERE id = NEW.class_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turma % não encontrada', NEW.class_id;
    END IF;
    IF c.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Turma pertence a outra escola';
    END IF;
    NEW.class_code := c.code;
    NEW.serie := COALESCE(NULLIF(btrim(NEW.serie), ''), c.serie);
    NEW.turno := COALESCE(NULLIF(btrim(NEW.turno), ''), c.turno);
  ELSIF NEW.class_code IS NOT NULL AND btrim(NEW.class_code) <> '' THEN
    SELECT id INTO NEW.class_id
    FROM public.classes
    WHERE school_id = NEW.school_id
      AND lower(code) = lower(btrim(NEW.class_code))
    ORDER BY year_label DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_sync_class ON public.students;
CREATE TRIGGER trg_students_sync_class
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_class_fields();

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_select ON public.students;
DROP POLICY IF EXISTS students_insert ON public.students;
DROP POLICY IF EXISTS students_update ON public.students;
DROP POLICY IF EXISTS students_delete ON public.students;

CREATE POLICY students_select ON public.students
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY students_insert ON public.students
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY students_update ON public.students
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY students_delete ON public.students
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated;

-- =========================================================
-- Exemplo (opcional — descomente e troque o school_id)
-- =========================================================
-- INSERT INTO public.students (
--   school_id, class_code, full_name, cpf, birth_date, email,
--   guardian_name, guardian_contact, status, attendance_pct, needs_password_set
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'M1MNM01',
--   'Aluno Exemplo',
--   '00000000000',
--   DATE '2010-05-20',
--   'aluno.exemplo@aluno.seduc.pa.gov.br',
--   'Responsável Exemplo',
--   '(94) 99999-0000',
--   'Ativo',
--   95,
--   true
-- );

-- Conferência:
-- SELECT s.nome, st.full_name, st.class_code, st.status
-- FROM public.students st
-- JOIN public.schools s ON s.id = st.school_id
-- ORDER BY s.nome, st.full_name;
