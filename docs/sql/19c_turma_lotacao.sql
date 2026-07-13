-- SIGA EDUCA — Professores da Turma (Detalhe da Turma)
-- Execute no SQL Editor do Supabase se 19_lotacao.sql já tiver sido aplicado.
-- Retorna todas as disciplinas da turma (lotadas ou vagas).
-- Sem professor → professor_nome = 'SEM LOTAÇÃO'

CREATE OR REPLACE FUNCTION public.turma_lotacao_rows(
  p_turma_code text,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  turma_code text,
  disciplina text,
  disciplina_codigo text,
  ch_semanal numeric,
  professor_nome text,
  professor_matricula text,
  status_lotacao text,
  year_number integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_turma text := upper(btrim(COALESCE(p_turma_code, '')));
BEGIN
  IF v_uid IS NULL OR v_turma = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.turma_code,
    a.disciplina,
    a.disciplina_codigo,
    COALESCE(a.ch_disciplina, 0)::numeric AS ch_semanal,
    CASE
      WHEN a.professor_id IS NULL
       AND NULLIF(btrim(COALESCE(a.professor_nome, '')), '') IS NULL
      THEN 'SEM LOTAÇÃO'::text
      ELSE COALESCE(a.professor_nome, p.full_name, 'SEM LOTAÇÃO'::text)
    END AS professor_nome,
    COALESCE(
      a.professor_matricula,
      CASE
        WHEN p.matricula IS NULL THEN NULL
        WHEN p.matricula_dv IS NOT NULL AND p.matricula_dv <> '' THEN p.matricula || '-' || p.matricula_dv
        ELSE p.matricula
      END
    ) AS professor_matricula,
    CASE
      WHEN a.professor_id IS NULL
       AND NULLIF(btrim(COALESCE(a.professor_nome, '')), '') IS NULL
      THEN 'vago'::text
      ELSE 'lotado'::text
    END AS status_lotacao,
    a.year_number
  FROM public.lotacao_alocacoes a
  LEFT JOIN public.lotacao_professores p ON p.id = a.professor_id
  WHERE a.year_number = v_year
    AND upper(btrim(a.turma_code)) = v_turma
    AND public.user_can_access_school(a.school_id)
  ORDER BY a.disciplina, professor_nome;
END;
$$;

COMMENT ON FUNCTION public.turma_lotacao_rows(text, integer) IS
  'Lista lotação da turma (Nome do Professor + Disciplina). Vagas = SEM LOTAÇÃO.';

REVOKE ALL ON FUNCTION public.turma_lotacao_rows(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.turma_lotacao_rows(text, integer) TO authenticated;
