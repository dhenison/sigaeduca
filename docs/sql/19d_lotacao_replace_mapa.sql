-- SIGA EDUCA — Sync Lotação (replace atômico do mapa por escola/ano)
-- Pré-requisitos: 19_lotacao.sql
-- Usado pelo frontend (js/siga-lotacao-sync.js) como opção segura.
-- Também funciona o fluxo delete+insert direto nas tabelas (RLS).

CREATE OR REPLACE FUNCTION public.lotacao_replace_mapa(
  p_school_id uuid,
  p_year integer,
  p_alocacoes jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r jsonb;
  v_prof_id uuid;
  v_mat text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_school_id IS NULL OR NOT public.user_can_access_school(p_school_id) THEN
    RAISE EXCEPTION 'Sem acesso à escola';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Ano inválido';
  END IF;

  DELETE FROM public.lotacao_alocacoes
  WHERE school_id = p_school_id
    AND year_number = p_year;

  IF p_alocacoes IS NULL OR jsonb_typeof(p_alocacoes) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_alocacoes)
  LOOP
    v_mat := regexp_replace(
      split_part(btrim(COALESCE(r->>'professor_matricula', '')), '-', 1),
      '\D', '', 'g'
    );
    v_prof_id := NULL;
    IF v_mat <> '' THEN
      SELECT id INTO v_prof_id
      FROM public.lotacao_professores
      WHERE school_id = p_school_id
        AND matricula = v_mat
      LIMIT 1;
    END IF;

    INSERT INTO public.lotacao_alocacoes (
      school_id, year_number, oferta, modalidade, turno, turma_code, num_alunos,
      disciplina, disciplina_codigo, ch_disciplina,
      professor_id, professor_nome, professor_matricula, ch_professor, sort_order
    ) VALUES (
      p_school_id,
      p_year,
      NULLIF(r->>'oferta', '')::integer,
      COALESCE(NULLIF(btrim(r->>'modalidade'), ''), 'REG'),
      COALESCE(NULLIF(btrim(r->>'turno'), ''), 'MANHÃ'),
      upper(btrim(COALESCE(r->>'turma_code', ''))),
      NULLIF(r->>'num_alunos', '')::integer,
      upper(btrim(COALESCE(r->>'disciplina', ''))),
      NULLIF(btrim(COALESCE(r->>'disciplina_codigo', '')), ''),
      NULLIF(r->>'ch_disciplina', '')::numeric,
      v_prof_id,
      NULLIF(upper(btrim(COALESCE(r->>'professor_nome', ''))), ''),
      NULLIF(btrim(COALESCE(r->>'professor_matricula', '')), ''),
      NULLIF(r->>'ch_professor', '')::numeric,
      COALESCE(NULLIF(r->>'sort_order', '')::integer, v_count)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.lotacao_replace_mapa(uuid, integer, jsonb) IS
  'Substitui o mapa de lotação (alocações) da escola/ano em uma transação.';

REVOKE ALL ON FUNCTION public.lotacao_replace_mapa(uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lotacao_replace_mapa(uuid, integer, jsonb) TO authenticated;
