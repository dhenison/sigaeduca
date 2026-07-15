-- SIGA EDUCA — Documentos Administrativos (Gestão Escolar) no Supabase
-- Fonte de verdade: banco. Sem Google Drive.
-- Pré-requisitos: schools, user_can_access_school(), set_updated_at()

CREATE TABLE IF NOT EXISTS public.admin_school_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  local_id text NOT NULL,
  doc_type text NOT NULL,
  destinatario text,
  emitido_por text,
  numero integer,
  ano text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_school_documents_local_unique UNIQUE (school_id, local_id),
  CONSTRAINT admin_school_documents_type_not_blank CHECK (length(btrim(doc_type)) > 0),
  CONSTRAINT admin_school_documents_local_not_blank CHECK (length(btrim(local_id)) > 0)
);

COMMENT ON TABLE public.admin_school_documents IS 'Ofícios, memorandos, requerimentos e demais docs da Gestão Escolar';
COMMENT ON COLUMN public.admin_school_documents.local_id IS 'ID gerado no cliente (adm-...) para upsert idempotente';
COMMENT ON COLUMN public.admin_school_documents.dados IS 'Payload completo do formulário (corpo, pedidos, etc.)';

CREATE INDEX IF NOT EXISTS admin_school_documents_school_idx
  ON public.admin_school_documents (school_id);

CREATE INDEX IF NOT EXISTS admin_school_documents_type_idx
  ON public.admin_school_documents (school_id, doc_type);

CREATE INDEX IF NOT EXISTS admin_school_documents_created_idx
  ON public.admin_school_documents (school_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_admin_school_documents_updated ON public.admin_school_documents;
CREATE TRIGGER trg_admin_school_documents_updated
  BEFORE UPDATE ON public.admin_school_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admin_school_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_school_documents_select ON public.admin_school_documents;
CREATE POLICY admin_school_documents_select ON public.admin_school_documents
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS admin_school_documents_insert ON public.admin_school_documents;
CREATE POLICY admin_school_documents_insert ON public.admin_school_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS admin_school_documents_update ON public.admin_school_documents;
CREATE POLICY admin_school_documents_update ON public.admin_school_documents
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS admin_school_documents_delete ON public.admin_school_documents;
CREATE POLICY admin_school_documents_delete ON public.admin_school_documents
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_school_documents TO authenticated;

-- Contadores de Ofício / Memorando por escola
CREATE TABLE IF NOT EXISTS public.admin_doc_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, kind),
  CONSTRAINT admin_doc_counters_kind_chk CHECK (kind = ANY (ARRAY['oficio'::text, 'memorando'::text])),
  CONSTRAINT admin_doc_counters_next_chk CHECK (next_number >= 1)
);

COMMENT ON TABLE public.admin_doc_counters IS 'Próximo número de Ofício/Memorando por escola';

ALTER TABLE public.admin_doc_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_doc_counters_all ON public.admin_doc_counters;
CREATE POLICY admin_doc_counters_all ON public.admin_doc_counters
  FOR ALL TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_doc_counters TO authenticated;
