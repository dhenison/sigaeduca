-- SIGA EDUCA — Minha Lotação (integração Meu Perfil ↔ Lotação)
-- Execute no SQL Editor do Supabase se 19_lotacao.sql já tiver sido aplicado.
-- Pré-requisitos: lotacao_professores, lotacao_alocacoes, school_staff, auth.uid()

-- Liga professor da lotação ao colaborador logado (por staff_id ou matrícula)
CREATE OR REPLACE FUNCTION public.minha_lotacao_rows(p_year integer DEFAULT NULL)
RETURNS TABLE (
  turma_code text,
  disciplina text,
  disciplina_codigo text,
  ch_semanal numeric,
  ch_mensal numeric,
  professor_nome text,
  professor_matricula text,
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH me AS (
    SELECT
      s.id AS staff_id,
      s.school_id,
      upper(btrim(s.full_name)) AS full_name,
      regexp_replace(COALESCE(s.employee_id, ''), '\D', '', 'g') AS matricula
    FROM public.school_staff s
    WHERE s.user_id = v_uid
       OR lower(s.email) = lower(COALESCE((SELECT email FROM auth.users WHERE id = v_uid), ''))
  ),
  prof AS (
    SELECT p.*
    FROM public.lotacao_professores p
    JOIN me ON me.school_id = p.school_id
    WHERE p.staff_id = me.staff_id
       OR (me.matricula <> '' AND p.matricula = me.matricula)
       OR upper(btrim(p.full_name)) = me.full_name
  )
  SELECT
    a.turma_code,
    a.disciplina,
    a.disciplina_codigo,
    COALESCE(a.ch_disciplina, 0)::numeric AS ch_semanal,
    (COALESCE(a.ch_disciplina, 0) * 5)::numeric AS ch_mensal,
    COALESCE(a.professor_nome, p.full_name) AS professor_nome,
    COALESCE(
      a.professor_matricula,
      CASE
        WHEN p.matricula_dv IS NOT NULL AND p.matricula_dv <> '' THEN p.matricula || '-' || p.matricula_dv
        ELSE p.matricula
      END
    ) AS professor_matricula,
    a.year_number
  FROM public.lotacao_alocacoes a
  JOIN prof p ON p.id = a.professor_id OR (
    a.professor_id IS NULL
    AND a.school_id = p.school_id
    AND (
      regexp_replace(split_part(COALESCE(a.professor_matricula, ''), '-', 1), '\D', '', 'g') = p.matricula
      OR upper(btrim(COALESCE(a.professor_nome, ''))) = upper(btrim(p.full_name))
    )
  )
  WHERE a.year_number = v_year
    AND public.user_can_access_school(a.school_id)
  ORDER BY a.turma_code, a.disciplina;
END;
$$;

REVOKE ALL ON FUNCTION public.minha_lotacao_rows(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minha_lotacao_rows(integer) TO authenticated;

COMMENT ON FUNCTION public.minha_lotacao_rows(integer) IS
  'Retorna a lotação do servidor autenticado (CH semanal e mensal = semanal × 5)';
