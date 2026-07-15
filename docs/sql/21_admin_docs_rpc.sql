-- RPC segura para upsert/listagem de documentos administrativos (Gestão Escolar)
-- Aplicado também via Migration no projeto digjzihjboflcuftmokj

CREATE OR REPLACE FUNCTION public.upsert_admin_school_document(
  p_school_id uuid,
  p_local_id text,
  p_doc_type text,
  p_destinatario text DEFAULT NULL,
  p_emitido_por text DEFAULT NULL,
  p_numero integer DEFAULT NULL,
  p_ano text DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb,
  p_created_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_school_id IS NULL OR NOT public.user_can_access_school(p_school_id) THEN
    RAISE EXCEPTION 'Sem acesso à escola';
  END IF;
  IF p_local_id IS NULL OR length(btrim(p_local_id)) = 0 THEN
    RAISE EXCEPTION 'local_id inválido';
  END IF;
  IF p_doc_type IS NULL OR length(btrim(p_doc_type)) = 0 THEN
    RAISE EXCEPTION 'doc_type inválido';
  END IF;

  INSERT INTO public.admin_school_documents (
    school_id, local_id, doc_type, destinatario, emitido_por, numero, ano, dados, created_at, updated_at
  ) VALUES (
    p_school_id,
    btrim(p_local_id),
    btrim(p_doc_type),
    NULLIF(btrim(COALESCE(p_destinatario, '')), ''),
    NULLIF(btrim(COALESCE(p_emitido_por, '')), ''),
    p_numero,
    NULLIF(btrim(COALESCE(p_ano, '')), ''),
    COALESCE(p_dados, '{}'::jsonb),
    COALESCE(p_created_at, now()),
    now()
  )
  ON CONFLICT (school_id, local_id) DO UPDATE SET
    doc_type = EXCLUDED.doc_type,
    destinatario = EXCLUDED.destinatario,
    emitido_por = EXCLUDED.emitido_por,
    numero = EXCLUDED.numero,
    ano = EXCLUDED.ano,
    dados = EXCLUDED.dados,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_admin_school_document(uuid, text, text, text, text, integer, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_admin_school_document(uuid, text, text, text, text, integer, text, jsonb, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_school_documents(p_school_id uuid)
RETURNS SETOF public.admin_school_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_school_id IS NULL OR NOT public.user_can_access_school(p_school_id) THEN
    RAISE EXCEPTION 'Sem acesso à escola';
  END IF;
  RETURN QUERY
    SELECT d.*
    FROM public.admin_school_documents d
    WHERE d.school_id = p_school_id
    ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_school_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_school_documents(uuid) TO authenticated;
