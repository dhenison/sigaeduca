-- SIGA EDUCA — Menu 5: Frequência
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, classes, students, user_can_access_school()
-- App hoje: localStorage siga_attendance_YYYY-MM-DD_CLASSCODE
--   { entrada: { consolidado, records: { studentId: { status, justification } } },
--     saida:   { consolidado, records: { ... } } }

-- =========================================================
-- 1) Chamada do dia (por turma)  →  public.attendance_calls
-- =========================================================

CREATE TABLE IF NOT EXISTS public.attendance_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_code text NOT NULL,
  day_date date NOT NULL,
  entrada_consolidada boolean NOT NULL DEFAULT false,
  saida_consolidada boolean NOT NULL DEFAULT false,
  entrada_consolidada_at timestamptz,
  saida_consolidada_at timestamptz,
  entrada_consolidada_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saida_consolidada_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_calls_school_class_date_unique UNIQUE (school_id, class_code, day_date),
  CONSTRAINT attendance_calls_class_code_not_blank CHECK (length(btrim(class_code)) > 0)
);

COMMENT ON TABLE public.attendance_calls IS 'Chamada diária por turma (entrada + saída)';
COMMENT ON COLUMN public.attendance_calls.class_code IS 'Código da turma (chave usada no app: siga_attendance_DATA_CODE)';
COMMENT ON COLUMN public.attendance_calls.entrada_consolidada IS 'Espelha entrada.consolidado';
COMMENT ON COLUMN public.attendance_calls.saida_consolidada IS 'Espelha saida.consolidado';

CREATE INDEX IF NOT EXISTS attendance_calls_school_idx
  ON public.attendance_calls (school_id);

CREATE INDEX IF NOT EXISTS attendance_calls_school_date_idx
  ON public.attendance_calls (school_id, day_date);

CREATE INDEX IF NOT EXISTS attendance_calls_class_idx
  ON public.attendance_calls (class_id);

CREATE INDEX IF NOT EXISTS attendance_calls_class_code_idx
  ON public.attendance_calls (school_id, class_code, day_date);

DROP TRIGGER IF EXISTS trg_attendance_calls_updated ON public.attendance_calls;
CREATE TRIGGER trg_attendance_calls_updated
  BEFORE UPDATE ON public.attendance_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Resolve class_id pelo código quando possível
CREATE OR REPLACE FUNCTION public.sync_attendance_call_class()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.class_code := btrim(NEW.class_code);
  IF NEW.class_id IS NULL AND NEW.class_code IS NOT NULL THEN
    SELECT id INTO NEW.class_id
    FROM public.classes
    WHERE school_id = NEW.school_id
      AND lower(code) = lower(NEW.class_code)
    ORDER BY year_label DESC
    LIMIT 1;
  ELSIF NEW.class_id IS NOT NULL THEN
    PERFORM 1 FROM public.classes c
    WHERE c.id = NEW.class_id AND c.school_id = NEW.school_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turma % não pertence à escola %', NEW.class_id, NEW.school_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_calls_sync_class ON public.attendance_calls;
CREATE TRIGGER trg_attendance_calls_sync_class
  BEFORE INSERT OR UPDATE ON public.attendance_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_attendance_call_class();

ALTER TABLE public.attendance_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_calls_select ON public.attendance_calls;
DROP POLICY IF EXISTS attendance_calls_insert ON public.attendance_calls;
DROP POLICY IF EXISTS attendance_calls_update ON public.attendance_calls;
DROP POLICY IF EXISTS attendance_calls_delete ON public.attendance_calls;

CREATE POLICY attendance_calls_select ON public.attendance_calls
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY attendance_calls_insert ON public.attendance_calls
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY attendance_calls_update ON public.attendance_calls
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY attendance_calls_delete ON public.attendance_calls
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_calls TO authenticated;

-- =========================================================
-- 2) Marcações por aluno / fase  →  public.attendance_marks
-- status: P (presente) | F (falta) | FJ (falta justificada)
-- phase:  entrada | saida
-- =========================================================

CREATE TABLE IF NOT EXISTS public.attendance_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.attendance_calls(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  phase text NOT NULL,
  status text NOT NULL DEFAULT 'P',
  justification text,
  marked_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_marks_call_student_phase_unique UNIQUE (call_id, student_id, phase),
  CONSTRAINT attendance_marks_phase_chk CHECK (phase = ANY (ARRAY['entrada'::text, 'saida'::text])),
  CONSTRAINT attendance_marks_status_chk CHECK (status = ANY (ARRAY['P'::text, 'F'::text, 'FJ'::text])),
  CONSTRAINT attendance_marks_fj_needs_reason CHECK (
    status <> 'FJ' OR (justification IS NOT NULL AND length(btrim(justification)) > 0)
  )
);

COMMENT ON TABLE public.attendance_marks IS 'Presença/falta por aluno na chamada (entrada ou saída)';
COMMENT ON COLUMN public.attendance_marks.status IS 'P=Presente, F=Falta, FJ=Falta Justificada';
COMMENT ON COLUMN public.attendance_marks.phase IS 'entrada ou saida';

CREATE INDEX IF NOT EXISTS attendance_marks_school_idx
  ON public.attendance_marks (school_id);

CREATE INDEX IF NOT EXISTS attendance_marks_call_idx
  ON public.attendance_marks (call_id);

CREATE INDEX IF NOT EXISTS attendance_marks_student_idx
  ON public.attendance_marks (student_id);

CREATE INDEX IF NOT EXISTS attendance_marks_status_idx
  ON public.attendance_marks (school_id, status);

DROP TRIGGER IF EXISTS trg_attendance_marks_updated ON public.attendance_marks;
CREATE TRIGGER trg_attendance_marks_updated
  BEFORE UPDATE ON public.attendance_marks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Garante school_id / student da mesma escola da chamada
CREATE OR REPLACE FUNCTION public.sync_attendance_mark_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  call_school uuid;
  student_school uuid;
BEGIN
  SELECT school_id INTO call_school FROM public.attendance_calls WHERE id = NEW.call_id;
  IF call_school IS NULL THEN
    RAISE EXCEPTION 'Chamada % não encontrada', NEW.call_id;
  END IF;
  NEW.school_id := call_school;

  SELECT school_id INTO student_school FROM public.students WHERE id = NEW.student_id;
  IF student_school IS NULL THEN
    RAISE EXCEPTION 'Aluno % não encontrado', NEW.student_id;
  END IF;
  IF student_school <> call_school THEN
    RAISE EXCEPTION 'Aluno e chamada pertencem a escolas diferentes';
  END IF;

  IF NEW.status = 'FJ' THEN
    NEW.justification := btrim(COALESCE(NEW.justification, ''));
  ELSIF NEW.status <> 'FJ' THEN
    NEW.justification := NULLIF(btrim(COALESCE(NEW.justification, '')), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_marks_sync ON public.attendance_marks;
CREATE TRIGGER trg_attendance_marks_sync
  BEFORE INSERT OR UPDATE ON public.attendance_marks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_attendance_mark_school();

ALTER TABLE public.attendance_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_marks_select ON public.attendance_marks;
DROP POLICY IF EXISTS attendance_marks_insert ON public.attendance_marks;
DROP POLICY IF EXISTS attendance_marks_update ON public.attendance_marks;
DROP POLICY IF EXISTS attendance_marks_delete ON public.attendance_marks;

CREATE POLICY attendance_marks_select ON public.attendance_marks
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY attendance_marks_insert ON public.attendance_marks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY attendance_marks_update ON public.attendance_marks
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY attendance_marks_delete ON public.attendance_marks
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_marks TO authenticated;

-- =========================================================
-- Exemplos (opcional)
-- =========================================================
-- INSERT INTO public.attendance_calls (school_id, class_code, day_date)
-- VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'M1MNM01', CURRENT_DATE)
-- RETURNING id;
--
-- INSERT INTO public.attendance_marks (call_id, student_id, phase, status)
-- VALUES
--   ('call-uuid', 'student-uuid', 'entrada', 'P'),
--   ('call-uuid', 'student-uuid', 'saida', 'P');

-- Conferência:
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('attendance_calls', 'attendance_marks');
