-- SIGA EDUCA — Menu 3: Turmas
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, academic_years, user_can_access_school()
-- Próximo arquivo: 04_alunos.sql

-- =========================================================
-- TURMAS  →  public.classes
-- Espelha siga_classes: code, serie, turno, modalidade, status, anoLetivo
-- =========================================================

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  code text NOT NULL,
  serie text NOT NULL,
  turno text NOT NULL DEFAULT 'Manhã',
  modalidade text,
  status text NOT NULL DEFAULT 'Ativo',
  year_label text NOT NULL DEFAULT '2026',
  capacity integer NOT NULL DEFAULT 35,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classes_school_code_year_unique UNIQUE (school_id, code, year_label),
  CONSTRAINT classes_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT classes_serie_not_blank CHECK (length(btrim(serie)) > 0),
  CONSTRAINT classes_status_chk CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text])),
  CONSTRAINT classes_turno_chk CHECK (
    turno = ANY (ARRAY['Manhã'::text, 'Tarde'::text, 'Noite'::text, 'Integral'::text])
  ),
  CONSTRAINT classes_capacity_chk CHECK (capacity > 0 AND capacity <= 200)
);

COMMENT ON TABLE public.classes IS 'Turmas por escola (tenant)';
COMMENT ON COLUMN public.classes.code IS 'Código da turma (ex.: M1MNM01) — campo code do app';
COMMENT ON COLUMN public.classes.year_label IS 'Ano letivo textual (anoLetivo no app), ex.: 2026';
COMMENT ON COLUMN public.classes.capacity IS 'Capacidade padrão usada no painel de turmas (35)';

CREATE INDEX IF NOT EXISTS classes_school_idx ON public.classes (school_id);
CREATE INDEX IF NOT EXISTS classes_school_year_idx ON public.classes (school_id, year_label);
CREATE INDEX IF NOT EXISTS classes_status_idx ON public.classes (school_id, status);
CREATE INDEX IF NOT EXISTS classes_code_idx ON public.classes (school_id, lower(code));

DROP TRIGGER IF EXISTS trg_classes_updated ON public.classes;
CREATE TRIGGER trg_classes_updated
  BEFORE UPDATE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classes_select ON public.classes;
DROP POLICY IF EXISTS classes_insert ON public.classes;
DROP POLICY IF EXISTS classes_update ON public.classes;
DROP POLICY IF EXISTS classes_delete ON public.classes;

CREATE POLICY classes_select ON public.classes
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY classes_insert ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY classes_update ON public.classes
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY classes_delete ON public.classes
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classes TO authenticated;

-- =========================================================
-- Exemplo (opcional — descomente e troque o school_id)
-- =========================================================
-- INSERT INTO public.classes (school_id, code, serie, turno, modalidade, status, year_label)
-- VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'M1MNM01',
--   '1º ano do ensino médio',
--   'Manhã',
--   'Ensino Médio',
--   'Ativo',
--   '2026'
-- );

-- Conferência:
-- SELECT s.nome, c.code, c.serie, c.turno, c.year_label, c.status
-- FROM public.classes c
-- JOIN public.schools s ON s.id = c.school_id
-- ORDER BY s.nome, c.code;
