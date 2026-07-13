-- SIGA EDUCA — Menu 13: Boletins
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, classes, students, user_can_access_school()
-- App hoje: siga_boletim_status + siga_boletim_meta (localStorage)
--           PDFs em IndexedDB (siga_boletins_db)
-- No Supabase: metadados no Postgres; arquivo em Storage (path) — não bytea gigante

-- =========================================================
-- 1) Publicação por turma/ano/bimestre  →  public.report_card_batches
-- =========================================================

CREATE TABLE IF NOT EXISTS public.report_card_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_code text NOT NULL,
  year_label text NOT NULL DEFAULT '2026',
  term_label text NOT NULL,
  status text NOT NULL DEFAULT 'Publicado',
  published_count integer NOT NULL DEFAULT 0,
  total_students integer NOT NULL DEFAULT 0,
  source_file_name text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_card_batches_class_code_not_blank CHECK (length(btrim(class_code)) > 0),
  CONSTRAINT report_card_batches_term_not_blank CHECK (length(btrim(term_label)) > 0),
  CONSTRAINT report_card_batches_school_class_year_term_unique
    UNIQUE (school_id, class_code, year_label, term_label),
  CONSTRAINT report_card_batches_status_chk CHECK (
    status = ANY (ARRAY['Rascunho'::text, 'Publicado'::text, 'Arquivado'::text])
  ),
  CONSTRAINT report_card_batches_counts_chk CHECK (
    published_count >= 0 AND total_students >= 0
  )
);

COMMENT ON TABLE public.report_card_batches IS 'Status de publicação de boletins por turma/ano/bimestre';
COMMENT ON COLUMN public.report_card_batches.term_label IS 'Ex.: 1º Bimestre (campo bimestre no app)';
COMMENT ON COLUMN public.report_card_batches.class_code IS 'Código da turma (chave do statusKey no app)';

CREATE INDEX IF NOT EXISTS report_card_batches_school_idx
  ON public.report_card_batches (school_id);

CREATE INDEX IF NOT EXISTS report_card_batches_class_idx
  ON public.report_card_batches (school_id, class_code, year_label);

DROP TRIGGER IF EXISTS trg_report_card_batches_updated ON public.report_card_batches;
CREATE TRIGGER trg_report_card_batches_updated
  BEFORE UPDATE ON public.report_card_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.report_card_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_card_batches_select ON public.report_card_batches;
DROP POLICY IF EXISTS report_card_batches_insert ON public.report_card_batches;
DROP POLICY IF EXISTS report_card_batches_update ON public.report_card_batches;
DROP POLICY IF EXISTS report_card_batches_delete ON public.report_card_batches;

CREATE POLICY report_card_batches_select ON public.report_card_batches
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY report_card_batches_insert ON public.report_card_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY report_card_batches_update ON public.report_card_batches
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY report_card_batches_delete ON public.report_card_batches
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_card_batches TO authenticated;

-- =========================================================
-- 2) Boletim por aluno  →  public.report_cards
-- =========================================================

CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.report_card_batches(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  student_inep text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_code text NOT NULL,
  year_label text NOT NULL DEFAULT '2026',
  term_label text NOT NULL,
  file_name text,
  storage_path text,
  storage_bucket text DEFAULT 'report-cards',
  file_size_bytes integer,
  mime_type text DEFAULT 'application/pdf',
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_cards_name_not_blank CHECK (length(btrim(student_name)) > 0),
  CONSTRAINT report_cards_class_code_not_blank CHECK (length(btrim(class_code)) > 0),
  CONSTRAINT report_cards_term_not_blank CHECK (length(btrim(term_label)) > 0)
);

COMMENT ON TABLE public.report_cards IS 'Metadados do boletim PDF por aluno/ano/bimestre';
COMMENT ON COLUMN public.report_cards.storage_path IS 'Caminho no Supabase Storage (ex.: {school_id}/{year}/{term}/{student_id}.pdf)';
COMMENT ON COLUMN public.report_cards.file_name IS 'Nome amigável do arquivo (fileName no app)';

-- Um boletim por aluno/ano/bimestre na escola
CREATE UNIQUE INDEX IF NOT EXISTS report_cards_unique_student_term
  ON public.report_cards (school_id, student_id, year_label, term_label)
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS report_cards_school_idx ON public.report_cards (school_id);
CREATE INDEX IF NOT EXISTS report_cards_student_idx ON public.report_cards (student_id);
CREATE INDEX IF NOT EXISTS report_cards_class_term_idx
  ON public.report_cards (school_id, class_code, year_label, term_label);
CREATE INDEX IF NOT EXISTS report_cards_batch_idx ON public.report_cards (batch_id);

DROP TRIGGER IF EXISTS trg_report_cards_updated ON public.report_cards;
CREATE TRIGGER trg_report_cards_updated
  BEFORE UPDATE ON public.report_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_report_card_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
BEGIN
  NEW.student_name := btrim(NEW.student_name);
  NEW.class_code := btrim(NEW.class_code);
  NEW.term_label := btrim(NEW.term_label);
  NEW.year_label := btrim(NEW.year_label);

  IF NEW.student_id IS NOT NULL THEN
    SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
    IF FOUND THEN
      IF st.school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Aluno pertence a outra escola';
      END IF;
      NEW.student_name := COALESCE(NULLIF(NEW.student_name, ''), st.full_name);
      NEW.student_inep := COALESCE(NULLIF(btrim(COALESCE(NEW.student_inep, '')), ''), st.codigo_inep);
      NEW.class_code := COALESCE(NULLIF(NEW.class_code, ''), st.class_code, NEW.class_code);
      NEW.class_id := COALESCE(NEW.class_id, st.class_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_cards_sync ON public.report_cards;
CREATE TRIGGER trg_report_cards_sync
  BEFORE INSERT OR UPDATE ON public.report_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_report_card_fields();

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_cards_select ON public.report_cards;
DROP POLICY IF EXISTS report_cards_insert ON public.report_cards;
DROP POLICY IF EXISTS report_cards_update ON public.report_cards;
DROP POLICY IF EXISTS report_cards_delete ON public.report_cards;

CREATE POLICY report_cards_select ON public.report_cards
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY report_cards_insert ON public.report_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY report_cards_update ON public.report_cards
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY report_cards_delete ON public.report_cards
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_cards TO authenticated;

-- Nota Storage (criar depois no painel Supabase, se desejar):
-- Bucket privado: report-cards
-- Path sugerido: {school_id}/{year_label}/{term_label}/{student_id}.pdf

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('report_card_batches', 'report_cards');
