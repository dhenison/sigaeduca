-- SIGA EDUCA — Menu 9: Documentos da Secretaria
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, students, user_can_access_school()
-- App hoje: localStorage siga_documentos_secretaria
-- Validade padrão das declarações: 30 dias (requerimentos não expiram)

-- =========================================================
-- Documentos  →  public.secretary_documents
-- =========================================================

CREATE TABLE IF NOT EXISTS public.secretary_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  protocolo text NOT NULL,
  doc_type text NOT NULL,
  status text NOT NULL DEFAULT 'concluido',
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text,
  student_cpf text,
  student_class_code text,
  student_serie text,
  student_turno text,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  validity_days integer NOT NULL DEFAULT 30,
  requester_name text,
  reason text,
  notes text,
  responsible_name text,
  birth_city text,
  birth_uf text,
  birth_date date,
  attendance_pct text,
  vacancy_stage text,
  vacancy_shift text,
  year_label text NOT NULL DEFAULT '2026',
  mother_name text,
  father_name text,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secretary_documents_protocolo_school_unique UNIQUE (school_id, protocolo),
  CONSTRAINT secretary_documents_protocolo_not_blank CHECK (length(btrim(protocolo)) > 0),
  CONSTRAINT secretary_documents_type_not_blank CHECK (length(btrim(doc_type)) > 0),
  CONSTRAINT secretary_documents_status_chk CHECK (
    status = ANY (ARRAY['pendente'::text, 'concluido'::text, 'cancelado'::text])
  ),
  CONSTRAINT secretary_documents_type_chk CHECK (
    doc_type = ANY (ARRAY[
      'Declaração de Matrícula'::text,
      'Declaração de Frequência (Bolsa Família)'::text,
      'Declaração de Escolaridade'::text,
      'Declaração de Vaga'::text,
      'Declaração de Transferência'::text,
      'Atestado de Conclusão'::text,
      'Requerimento de 2ª Via de Diploma'::text,
      'Requerimento de 2ª Via de Histórico Escolar'::text,
      'Requerimento de Transferência'::text,
      'Requerimento de Histórico e Diploma'::text
    ])
  ),
  CONSTRAINT secretary_documents_validity_days_chk CHECK (validity_days > 0 AND validity_days <= 365)
);

COMMENT ON TABLE public.secretary_documents IS 'Declarações e requerimentos emitidos pela secretaria';
COMMENT ON COLUMN public.secretary_documents.protocolo IS 'Ex.: SEC-DEC-2026-K7M2P9QX4R8H (sufixo aleatório; antigos SEC-…-0001 válidos)';
COMMENT ON COLUMN public.secretary_documents.valid_until IS 'Validade (declarações); NULL para requerimentos';
COMMENT ON COLUMN public.secretary_documents.vacancy_stage IS 'Etapa da Declaração de Vaga (vagaEtapa)';
COMMENT ON COLUMN public.secretary_documents.vacancy_shift IS 'Turno da Declaração de Vaga (vagaTurno)';
COMMENT ON COLUMN public.secretary_documents.attendance_pct IS 'Frequência informada (Bolsa Família)';
COMMENT ON COLUMN public.secretary_documents.year_label IS 'Ano letivo informado (ex.: Atestado de Conclusão)';
COMMENT ON COLUMN public.secretary_documents.mother_name IS 'Nome da mãe (Atestado de Conclusão; digitação livre)';
COMMENT ON COLUMN public.secretary_documents.father_name IS 'Nome do pai (Atestado de Conclusão; digitação livre)';
COMMENT ON COLUMN public.secretary_documents.student_id IS 'FK opcional; NULL quando o nome é digitado manualmente (ex.: Atestado de Conclusão)';
COMMENT ON COLUMN public.secretary_documents.student_name IS 'Nome do aluno; pode ser preenchido manualmente sem student_id';

CREATE INDEX IF NOT EXISTS secretary_documents_school_idx
  ON public.secretary_documents (school_id);

CREATE INDEX IF NOT EXISTS secretary_documents_protocolo_idx
  ON public.secretary_documents (protocolo);

CREATE INDEX IF NOT EXISTS secretary_documents_school_date_idx
  ON public.secretary_documents (school_id, issued_on DESC);

CREATE INDEX IF NOT EXISTS secretary_documents_type_idx
  ON public.secretary_documents (school_id, doc_type);

CREATE INDEX IF NOT EXISTS secretary_documents_status_idx
  ON public.secretary_documents (school_id, status);

CREATE INDEX IF NOT EXISTS secretary_documents_student_idx
  ON public.secretary_documents (student_id);

DROP TRIGGER IF EXISTS trg_secretary_documents_updated ON public.secretary_documents;
CREATE TRIGGER trg_secretary_documents_updated
  BEFORE UPDATE ON public.secretary_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_secretary_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  is_req boolean;
BEGIN
  NEW.protocolo := upper(btrim(NEW.protocolo));
  NEW.doc_type := btrim(NEW.doc_type);
  NEW.student_name := NULLIF(btrim(COALESCE(NEW.student_name, '')), '');
  NEW.student_cpf := NULLIF(regexp_replace(COALESCE(NEW.student_cpf, ''), '\D', '', 'g'), '');

  is_req := NEW.doc_type ILIKE 'Requerimento%';

  IF NEW.student_id IS NOT NULL THEN
    SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Aluno % não encontrado', NEW.student_id;
    END IF;
    IF st.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Aluno pertence a outra escola';
    END IF;
    NEW.student_name := COALESCE(NEW.student_name, st.full_name);
    NEW.student_cpf := COALESCE(NEW.student_cpf, NULLIF(regexp_replace(COALESCE(st.cpf, ''), '\D', '', 'g'), ''));
    NEW.student_class_code := COALESCE(NULLIF(btrim(COALESCE(NEW.student_class_code, '')), ''), st.class_code);
    NEW.student_serie := COALESCE(NULLIF(btrim(COALESCE(NEW.student_serie, '')), ''), st.serie);
    NEW.student_turno := COALESCE(NULLIF(btrim(COALESCE(NEW.student_turno, '')), ''), st.turno);
  END IF;

  -- Declarações: calcula validade; requerimentos: sem validade
  IF is_req THEN
    NEW.valid_until := NULL;
    IF NEW.status IS NULL OR NEW.status = 'concluido' THEN
      NEW.status := COALESCE(NULLIF(NEW.status, 'concluido'), 'pendente');
    END IF;
  ELSE
    IF NEW.valid_until IS NULL AND NEW.issued_on IS NOT NULL THEN
      NEW.valid_until := NEW.issued_on + make_interval(days => NEW.validity_days);
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.issued_by := COALESCE(NEW.issued_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_secretary_documents_sync ON public.secretary_documents;
CREATE TRIGGER trg_secretary_documents_sync
  BEFORE INSERT OR UPDATE ON public.secretary_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_secretary_document_fields();

ALTER TABLE public.secretary_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secretary_documents_select ON public.secretary_documents;
DROP POLICY IF EXISTS secretary_documents_insert ON public.secretary_documents;
DROP POLICY IF EXISTS secretary_documents_update ON public.secretary_documents;
DROP POLICY IF EXISTS secretary_documents_delete ON public.secretary_documents;

CREATE POLICY secretary_documents_select ON public.secretary_documents
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY secretary_documents_insert ON public.secretary_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY secretary_documents_update ON public.secretary_documents
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY secretary_documents_delete ON public.secretary_documents
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

-- Validação pública por protocolo (página validar-documento.html)
-- Anon pode LER apenas protocolo + metadados mínimos via view/RPC no futuro.
-- Por enquanto, leitura autenticada por escola; validação pública pode usar Edge Function.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secretary_documents TO authenticated;

-- =========================================================
-- Sequência auxiliar de protocolo por escola/ano/prefixo
-- =========================================================

CREATE TABLE IF NOT EXISTS public.secretary_protocol_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year_number integer NOT NULL,
  prefix text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  CONSTRAINT secretary_protocol_counters_unique UNIQUE (school_id, year_number, prefix),
  CONSTRAINT secretary_protocol_counters_prefix_chk CHECK (prefix = ANY (ARRAY['DEC'::text, 'REQ'::text])),
  CONSTRAINT secretary_protocol_counters_seq_chk CHECK (last_seq >= 0)
);

COMMENT ON TABLE public.secretary_protocol_counters IS 'Contador de protocolos SEC-DEC/REQ por escola e ano';

ALTER TABLE public.secretary_protocol_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secretary_protocol_counters_all ON public.secretary_protocol_counters;
CREATE POLICY secretary_protocol_counters_all ON public.secretary_protocol_counters
  FOR ALL TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secretary_protocol_counters TO authenticated;

-- Preferir docs/sql/09e_protocolo_aleatorio.sql em bases já criadas.
CREATE OR REPLACE FUNCTION public.next_secretary_protocol(
  p_school_id uuid,
  p_doc_type text,
  p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_protocolo text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_alpha_len integer := 32;
  v_i integer;
  v_attempt integer;
  v_byte integer;
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF NOT public.user_can_access_school(p_school_id) THEN
    RAISE EXCEPTION 'Sem acesso à escola';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    p_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  END IF;

  v_prefix := CASE
    WHEN p_doc_type ILIKE 'Requerimento%' THEN 'REQ'
    ELSE 'DEC'
  END;

  FOR v_attempt IN 1..40 LOOP
    v_suffix := '';
    FOR v_i IN 1..12 LOOP
      v_byte := get_byte(gen_random_bytes(1), 0);
      v_suffix := v_suffix || substr(v_alphabet, (v_byte % v_alpha_len) + 1, 1);
    END LOOP;

    v_protocolo := 'SEC-' || v_prefix || '-' || p_year::text || '-' || v_suffix;

    IF NOT EXISTS (
      SELECT 1
      FROM public.secretary_documents d
      WHERE d.school_id = p_school_id
        AND upper(d.protocolo) = upper(v_protocolo)
    ) THEN
      RETURN v_protocolo;
    END IF;
  END LOOP;

  v_suffix := '';
  FOR v_i IN 1..16 LOOP
    v_byte := get_byte(gen_random_bytes(1), 0);
    v_suffix := v_suffix || substr(v_alphabet, (v_byte % v_alpha_len) + 1, 1);
  END LOOP;

  RETURN 'SEC-' || v_prefix || '-' || p_year::text || '-' || v_suffix;
END;
$$;

COMMENT ON FUNCTION public.next_secretary_protocol(uuid, text, integer) IS
  'Gera protocolo SEC-{DEC|REQ}-{ano}-{12 chars aleatórios} (anti-enumeração QR)';

REVOKE ALL ON FUNCTION public.next_secretary_protocol(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_secretary_protocol(uuid, text, integer) TO authenticated;

-- =========================================================
-- Exemplos (opcional)
-- =========================================================
-- SELECT public.next_secretary_protocol(
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'Declaração de Matrícula',
--   2026
-- );
--
-- INSERT INTO public.secretary_documents (
--   school_id, protocolo, doc_type, status,
--   student_name, student_class_code, issued_on, year_label
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'SEC-DEC-2026-0001',
--   'Declaração de Matrícula',
--   'concluido',
--   'Aluno Exemplo',
--   'M1MNM01',
--   CURRENT_DATE,
--   '2026'
-- );

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('secretary_documents', 'secretary_protocol_counters');
