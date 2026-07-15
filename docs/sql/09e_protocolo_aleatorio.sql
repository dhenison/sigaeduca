-- =========================================================
-- Protocolos da Secretaria: sufixo aleatório (anti-enumeração)
-- Formato: SEC-DEC-2026-K7M2P9QX4R8H / SEC-REQ-2026-A3F8H2K9M4Q7
-- =========================================================

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

  -- Fallback extremamente improvável: sufixo de 16 caracteres
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

COMMENT ON COLUMN public.secretary_documents.protocolo IS
  'Ex.: SEC-DEC-2026-K7M2P9QX4R8H (sufixo aleatório; protocolos antigos SEC-…-0001 seguem válidos)';

REVOKE ALL ON FUNCTION public.next_secretary_protocol(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_secretary_protocol(uuid, text, integer) TO authenticated;
