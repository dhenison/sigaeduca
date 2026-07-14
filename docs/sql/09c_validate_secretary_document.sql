-- SIGA EDUCA — Validação pública de documentos da secretaria (QR Code)
-- Validade padrão: 30 dias a partir da emissão
-- Página: validar-documento.html?protocolo=SEC-...

CREATE OR REPLACE FUNCTION public.validate_secretary_document(p_protocolo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.secretary_documents%ROWTYPE;
  v_school_nome text;
  v_until date;
  v_valid boolean;
  v_days integer;
BEGIN
  IF p_protocolo IS NULL OR length(btrim(p_protocolo)) = 0 THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT d.*
  INTO r
  FROM public.secretary_documents d
  WHERE upper(btrim(d.protocolo)) = upper(btrim(p_protocolo))
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  v_days := COALESCE(NULLIF(r.validity_days, 0), 30);
  v_until := COALESCE(
    r.valid_until,
    (r.issued_on + (v_days || ' days')::interval)::date
  );
  v_valid := CURRENT_DATE <= v_until;

  SELECT s.nome INTO v_school_nome
  FROM public.schools s
  WHERE s.id = r.school_id;

  RETURN jsonb_build_object(
    'encontrado', true,
    'valido', v_valid,
    'status_label', CASE WHEN v_valid THEN 'Válido' ELSE 'Fora da Validade' END,
    'protocolo', r.protocolo,
    'tipo', r.doc_type,
    'alunoNome', COALESCE(r.student_name, ''),
    'alunoTurma', COALESCE(r.student_class_code, ''),
    'dataEmissao', r.issued_on,
    'dataValidade', v_until,
    'validityDays', v_days,
    'responsavel', COALESCE(r.responsible_name, 'Secretaria'),
    'solicitante', COALESCE(r.requester_name, ''),
    'motivo', COALESCE(r.reason, ''),
    'escola', COALESCE(v_school_nome, '')
  );
END;
$$;

COMMENT ON FUNCTION public.validate_secretary_document(text) IS
  'Consulta pública por protocolo (QR). Retorna validade de 30 dias: Válido ou Fora da Validade.';

REVOKE ALL ON FUNCTION public.validate_secretary_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_secretary_document(text) TO anon, authenticated;
