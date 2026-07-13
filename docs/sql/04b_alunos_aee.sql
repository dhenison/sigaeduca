-- SIGA EDUCA — AEE (Atendimento Educacional Especializado)
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: 03_turmas.sql, 04_alunos.sql
--
-- Problema: alunos regulares também frequentam EEMAE01 / EETAE01.
-- O modelo antigo tinha 1 turma por aluno → import/update sobrescrevia ou
-- violava UNIQUE (cpf/inep/email).
--
-- Solução:
--   • turma regular continua em students.class_code / class_id
--   • vínculos AEE em students.aee_class_codes (array de códigos)
--   • turmas EEMAE01 e EETAE01 marcadas com modalidade = 'AEE'

-- =========================================================
-- 1) Coluna de vínculos AEE no aluno
-- =========================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS aee_class_codes text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.students.aee_class_codes IS
  'Códigos de turmas AEE (ex.: EEMAE01, EETAE01). A turma regular permanece em class_code.';

CREATE INDEX IF NOT EXISTS students_aee_codes_gin_idx
  ON public.students USING gin (aee_class_codes);

-- =========================================================
-- 2) Marcar turmas AEE conhecidas
-- =========================================================

UPDATE public.classes
SET modalidade = 'AEE',
    updated_at = now()
WHERE upper(btrim(code)) IN ('EEMAE01', 'EETAE01');

-- =========================================================
-- 3) Normaliza aee_class_codes no trigger de alunos
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_student_class_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c public.classes%ROWTYPE;
  v_codes text[] := '{}'::text[];
  v_code text;
  v_norm text;
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

  -- Normaliza array AEE (maiúsculo, sem vazios, sem duplicar, sem a turma regular)
  IF NEW.aee_class_codes IS NULL THEN
    NEW.aee_class_codes := '{}'::text[];
  ELSE
    FOREACH v_code IN ARRAY NEW.aee_class_codes LOOP
      v_norm := upper(btrim(COALESCE(v_code, '')));
      IF v_norm <> ''
         AND (NEW.class_code IS NULL OR upper(btrim(NEW.class_code)) <> v_norm)
         AND NOT (v_norm = ANY (v_codes)) THEN
        v_codes := array_append(v_codes, v_norm);
      END IF;
    END LOOP;
    NEW.aee_class_codes := v_codes;
  END IF;

  -- Se class_code apontar para turma AEE, move para aee_class_codes e limpa regular
  IF NEW.class_code IS NOT NULL AND btrim(NEW.class_code) <> '' THEN
    SELECT * INTO c
    FROM public.classes
    WHERE school_id = NEW.school_id
      AND lower(code) = lower(btrim(NEW.class_code))
    ORDER BY year_label DESC
    LIMIT 1;

    IF FOUND AND (
      upper(c.code) IN ('EEMAE01', 'EETAE01')
      OR upper(COALESCE(c.modalidade, '')) = 'AEE'
    ) THEN
      IF NOT (upper(c.code) = ANY (NEW.aee_class_codes)) THEN
        NEW.aee_class_codes := array_append(NEW.aee_class_codes, upper(c.code));
      END IF;
      -- Não usa turma AEE como regular (evita perder a série/turno regular)
      IF TG_OP = 'UPDATE'
         AND OLD.class_code IS NOT NULL
         AND upper(btrim(OLD.class_code)) NOT IN ('EEMAE01', 'EETAE01')
         AND upper(COALESCE((
               SELECT modalidade FROM public.classes
               WHERE school_id = NEW.school_id AND lower(code) = lower(btrim(OLD.class_code))
               ORDER BY year_label DESC LIMIT 1
             ), '')) <> 'AEE' THEN
        NEW.class_code := OLD.class_code;
        NEW.class_id := OLD.class_id;
        NEW.serie := COALESCE(NULLIF(btrim(COALESCE(NEW.serie, '')), ''), OLD.serie);
        NEW.turno := COALESCE(NULLIF(btrim(COALESCE(NEW.turno, '')), ''), OLD.turno);
      ELSE
        NEW.class_id := NULL;
        NEW.class_code := NULL;
      END IF;
    END IF;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO c FROM public.classes WHERE id = NEW.class_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turma % não encontrada', NEW.class_id;
    END IF;
    IF c.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Turma pertence a outra escola';
    END IF;
    IF upper(c.code) IN ('EEMAE01', 'EETAE01') OR upper(COALESCE(c.modalidade, '')) = 'AEE' THEN
      IF NOT (upper(c.code) = ANY (NEW.aee_class_codes)) THEN
        NEW.aee_class_codes := array_append(NEW.aee_class_codes, upper(c.code));
      END IF;
      NEW.class_id := NULL;
      NEW.class_code := NULL;
    ELSE
      NEW.class_code := c.code;
      NEW.serie := COALESCE(NULLIF(btrim(NEW.serie), ''), c.serie);
      NEW.turno := COALESCE(NULLIF(btrim(NEW.turno), ''), c.turno);
    END IF;
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

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT code, modalidade FROM public.classes WHERE upper(code) IN ('EEMAE01','EETAE01');
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='students' AND column_name='aee_class_codes';
