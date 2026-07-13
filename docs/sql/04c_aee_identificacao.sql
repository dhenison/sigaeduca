-- SIGA EDUCA — Banco separado: Identificação AEE
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: 03_turmas.sql, 04_alunos.sql
-- Recomendado após: 04b_alunos_aee.sql (mantém aee_class_codes como espelho)
--
-- Fonte da verdade do vínculo AEE (aluno regular + EEMAE01/EETAE01):
--   1) public.aee_class_catalog     → quais turmas são AEE
--   2) public.student_aee_enrollments → quem está no AEE (sem perder turma regular)

-- =========================================================
-- 1) Catálogo de turmas AEE  →  public.aee_class_catalog
-- =========================================================

CREATE TABLE IF NOT EXISTS public.aee_class_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class_code text NOT NULL,
  label text NOT NULL DEFAULT 'Atendimento Educacional Especializado',
  short_label text NOT NULL DEFAULT 'AEE',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aee_class_catalog_code_not_blank CHECK (length(btrim(class_code)) > 0),
  CONSTRAINT aee_class_catalog_label_not_blank CHECK (length(btrim(label)) > 0)
);

COMMENT ON TABLE public.aee_class_catalog IS
  'Identificação das turmas AEE (EEMAE01, EETAE01, …). school_id NULL = padrão global.';
COMMENT ON COLUMN public.aee_class_catalog.class_code IS 'Código da turma AEE (ex.: EEMAE01)';
COMMENT ON COLUMN public.aee_class_catalog.short_label IS 'Rótulo curto exibido na UI (AEE)';

CREATE UNIQUE INDEX IF NOT EXISTS aee_class_catalog_global_unique
  ON public.aee_class_catalog (upper(class_code))
  WHERE school_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS aee_class_catalog_school_unique
  ON public.aee_class_catalog (school_id, upper(class_code))
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aee_class_catalog_active_idx
  ON public.aee_class_catalog (is_active);

DROP TRIGGER IF EXISTS trg_aee_class_catalog_updated ON public.aee_class_catalog;
CREATE TRIGGER trg_aee_class_catalog_updated
  BEFORE UPDATE ON public.aee_class_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_aee_catalog_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.class_code := upper(btrim(NEW.class_code));
  NEW.label := btrim(NEW.label);
  NEW.short_label := upper(btrim(COALESCE(NULLIF(NEW.short_label, ''), 'AEE')));
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aee_class_catalog_sync ON public.aee_class_catalog;
CREATE TRIGGER trg_aee_class_catalog_sync
  BEFORE INSERT OR UPDATE ON public.aee_class_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_aee_catalog_fields();

-- Seed global EEMAE01 / EETAE01
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.aee_class_catalog
    WHERE school_id IS NULL AND upper(class_code) = 'EEMAE01'
  ) THEN
    INSERT INTO public.aee_class_catalog (school_id, class_code, label, short_label, description)
    VALUES (NULL, 'EEMAE01', 'Atendimento Educacional Especializado — Manhã', 'AEE',
            'Turma AEE EEMAE01 (paralela à turma regular)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.aee_class_catalog
    WHERE school_id IS NULL AND upper(class_code) = 'EETAE01'
  ) THEN
    INSERT INTO public.aee_class_catalog (school_id, class_code, label, short_label, description)
    VALUES (NULL, 'EETAE01', 'Atendimento Educacional Especializado — Tarde', 'AEE',
            'Turma AEE EETAE01 (paralela à turma regular)');
  END IF;
END;
$$;

-- Marca as turmas existentes na escola com modalidade AEE
UPDATE public.classes c
SET modalidade = 'AEE',
    updated_at = now()
WHERE upper(btrim(c.code)) IN (
  SELECT upper(class_code) FROM public.aee_class_catalog WHERE is_active
);

ALTER TABLE public.aee_class_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aee_class_catalog_select ON public.aee_class_catalog;
DROP POLICY IF EXISTS aee_class_catalog_write ON public.aee_class_catalog;

CREATE POLICY aee_class_catalog_select ON public.aee_class_catalog
  FOR SELECT TO authenticated
  USING (
    school_id IS NULL
    OR public.user_can_access_school(school_id)
    OR public.is_system_admin()
  );

CREATE POLICY aee_class_catalog_write ON public.aee_class_catalog
  FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR (school_id IS NOT NULL AND public.user_can_access_school(school_id))
  )
  WITH CHECK (
    public.is_system_admin()
    OR (school_id IS NOT NULL AND public.user_can_access_school(school_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.aee_class_catalog TO authenticated;

-- =========================================================
-- 2) Vínculos aluno ↔ AEE  →  public.student_aee_enrollments
-- =========================================================

CREATE TABLE IF NOT EXISTS public.student_aee_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_code text NOT NULL,
  catalog_id uuid REFERENCES public.aee_class_catalog(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Ativo',
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_aee_enrollments_code_not_blank CHECK (length(btrim(class_code)) > 0),
  CONSTRAINT student_aee_enrollments_status_chk CHECK (
    status = ANY (ARRAY['Ativo'::text, 'Inativo'::text, 'Concluído'::text, 'Concluido'::text])
  ),
  CONSTRAINT student_aee_enrollments_unique UNIQUE (school_id, student_id, class_code)
);

COMMENT ON TABLE public.student_aee_enrollments IS
  'Identificação AEE por aluno: vínculo paralelo à turma regular (students.class_code)';
COMMENT ON COLUMN public.student_aee_enrollments.class_code IS 'EEMAE01 | EETAE01 (ou outro do catálogo)';
COMMENT ON COLUMN public.student_aee_enrollments.student_id IS 'Aluno regular; a turma regular NÃO é alterada aqui';

CREATE INDEX IF NOT EXISTS student_aee_enrollments_school_idx
  ON public.student_aee_enrollments (school_id);

CREATE INDEX IF NOT EXISTS student_aee_enrollments_student_idx
  ON public.student_aee_enrollments (student_id);

CREATE INDEX IF NOT EXISTS student_aee_enrollments_code_idx
  ON public.student_aee_enrollments (school_id, upper(class_code));

CREATE INDEX IF NOT EXISTS student_aee_enrollments_active_idx
  ON public.student_aee_enrollments (school_id, status)
  WHERE status = 'Ativo';

DROP TRIGGER IF EXISTS trg_student_aee_enrollments_updated ON public.student_aee_enrollments;
CREATE TRIGGER trg_student_aee_enrollments_updated
  BEFORE UPDATE ON public.student_aee_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_student_aee_enrollment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  cl public.classes%ROWTYPE;
  cat public.aee_class_catalog%ROWTYPE;
BEGIN
  NEW.class_code := upper(btrim(NEW.class_code));
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  NEW.status := COALESCE(NULLIF(btrim(NEW.status), ''), 'Ativo');

  SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno % não encontrado', NEW.student_id;
  END IF;
  IF st.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Aluno não pertence à escola informada';
  END IF;

  -- Resolve turma AEE na escola
  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO cl FROM public.classes WHERE id = NEW.class_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turma AEE % não encontrada', NEW.class_id;
    END IF;
    IF cl.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Turma AEE pertence a outra escola';
    END IF;
    NEW.class_code := upper(cl.code);
  ELSE
    SELECT * INTO cl
    FROM public.classes
    WHERE school_id = NEW.school_id
      AND upper(code) = NEW.class_code
    ORDER BY year_label DESC
    LIMIT 1;
    IF FOUND THEN
      NEW.class_id := cl.id;
    END IF;
  END IF;

  -- Valida / liga catálogo (global ou da escola)
  SELECT * INTO cat
  FROM public.aee_class_catalog
  WHERE is_active
    AND upper(class_code) = NEW.class_code
    AND (school_id IS NULL OR school_id = NEW.school_id)
  ORDER BY school_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    -- Auto-cadastra no catálogo da escola se for EEMAE01/EETAE01
    IF NEW.class_code IN ('EEMAE01', 'EETAE01') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.aee_class_catalog
        WHERE upper(class_code) = NEW.class_code
          AND (school_id IS NULL OR school_id = NEW.school_id)
      ) THEN
        INSERT INTO public.aee_class_catalog (school_id, class_code, label, short_label)
        VALUES (NEW.school_id, NEW.class_code, 'Atendimento Educacional Especializado', 'AEE');
      END IF;

      SELECT * INTO cat
      FROM public.aee_class_catalog
      WHERE upper(class_code) = NEW.class_code
        AND (school_id IS NULL OR school_id = NEW.school_id)
      ORDER BY school_id NULLS LAST
      LIMIT 1;
    ELSE
      RAISE EXCEPTION 'Código % não está no catálogo AEE', NEW.class_code;
    END IF;
  END IF;

  NEW.catalog_id := cat.id;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_aee_enrollments_sync ON public.student_aee_enrollments;
CREATE TRIGGER trg_student_aee_enrollments_sync
  BEFORE INSERT OR UPDATE ON public.student_aee_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_aee_enrollment_fields();

-- Espelho em students.aee_class_codes (compatível com 04b e o app)
CREATE OR REPLACE FUNCTION public.refresh_student_aee_codes(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  codes text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT upper(class_code) ORDER BY upper(class_code)), '{}'::text[])
  INTO codes
  FROM public.student_aee_enrollments
  WHERE student_id = p_student_id
    AND status = 'Ativo';

  UPDATE public.students
  SET aee_class_codes = codes,
      updated_at = now()
  WHERE id = p_student_id
    AND COALESCE(aee_class_codes, '{}'::text[]) IS DISTINCT FROM codes;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_student_aee_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_student_aee_codes(OLD.student_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_student_aee_codes(NEW.student_id);
  IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
    PERFORM public.refresh_student_aee_codes(OLD.student_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_aee_enrollments_refresh ON public.student_aee_enrollments;
CREATE TRIGGER trg_student_aee_enrollments_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.student_aee_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_student_aee_codes();

ALTER TABLE public.student_aee_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_aee_enrollments_select ON public.student_aee_enrollments;
DROP POLICY IF EXISTS student_aee_enrollments_insert ON public.student_aee_enrollments;
DROP POLICY IF EXISTS student_aee_enrollments_update ON public.student_aee_enrollments;
DROP POLICY IF EXISTS student_aee_enrollments_delete ON public.student_aee_enrollments;

CREATE POLICY student_aee_enrollments_select ON public.student_aee_enrollments
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY student_aee_enrollments_insert ON public.student_aee_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY student_aee_enrollments_update ON public.student_aee_enrollments
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY student_aee_enrollments_delete ON public.student_aee_enrollments
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_aee_enrollments TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_aee_codes(uuid) TO authenticated;

-- =========================================================
-- 3) Migração: array aee_class_codes → enrollments
-- =========================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS aee_class_codes text[] NOT NULL DEFAULT '{}'::text[];

INSERT INTO public.student_aee_enrollments (school_id, student_id, class_code, status)
SELECT
  s.school_id,
  s.id,
  upper(btrim(code)),
  'Ativo'
FROM public.students s
CROSS JOIN LATERAL unnest(COALESCE(s.aee_class_codes, '{}'::text[])) AS code
WHERE btrim(code) <> ''
ON CONFLICT (school_id, student_id, class_code) DO NOTHING;

-- Garante espelho atualizado
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT student_id FROM public.student_aee_enrollments
  LOOP
    PERFORM public.refresh_student_aee_codes(r.student_id);
  END LOOP;
END;
$$;

-- Helper: substitui vínculos AEE de um aluno (usado pelo app)
CREATE OR REPLACE FUNCTION public.set_student_aee_codes(
  p_student_id uuid,
  p_codes text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  v_codes text[] := '{}'::text[];
  v_code text;
  v_norm text;
BEGIN
  SELECT * INTO st FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno % não encontrado', p_student_id;
  END IF;

  IF NOT public.user_can_access_school(st.school_id) AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Sem acesso à escola do aluno';
  END IF;

  FOREACH v_code IN ARRAY COALESCE(p_codes, '{}'::text[]) LOOP
    v_norm := upper(btrim(COALESCE(v_code, '')));
    IF v_norm <> '' AND NOT (v_norm = ANY (v_codes)) THEN
      v_codes := array_append(v_codes, v_norm);
    END IF;
  END LOOP;

  DELETE FROM public.student_aee_enrollments
  WHERE student_id = p_student_id
    AND NOT (upper(class_code) = ANY (v_codes));

  FOREACH v_norm IN ARRAY v_codes LOOP
    INSERT INTO public.student_aee_enrollments (school_id, student_id, class_code, status)
    VALUES (st.school_id, p_student_id, v_norm, 'Ativo')
    ON CONFLICT (school_id, student_id, class_code) DO UPDATE
    SET status = 'Ativo',
        updated_at = now();
  END LOOP;

  PERFORM public.refresh_student_aee_codes(p_student_id);
  RETURN v_codes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_student_aee_codes(uuid, text[]) TO authenticated;

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT * FROM public.aee_class_catalog ORDER BY class_code;
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public'
--   AND table_name IN ('aee_class_catalog','student_aee_enrollments');
--
-- SELECT s.full_name, s.class_code AS turma_regular, e.class_code AS aee
-- FROM public.students s
-- JOIN public.student_aee_enrollments e ON e.student_id = s.id
-- WHERE e.status = 'Ativo'
-- ORDER BY s.full_name, e.class_code;
