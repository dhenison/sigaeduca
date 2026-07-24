-- SIGA EDUCA — Portal do Aluno: leitura de frequência (batidas faciais)
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Pré-requisito: 05_frequencia.sql, 05b_frequencia_lock_individual.sql, 13_portal_aluno_login.sql
--
-- O aluno autentica via RPC (anon), sem sessão auth.users.
-- Por isso NÃO usa SELECT direto em attendance_* (RLS só authenticated).
-- Estas funções SECURITY DEFINER devolvem só as marcas do próprio aluno.

CREATE OR REPLACE FUNCTION public.student_portal_attendance_day(
  p_student_id uuid,
  p_day_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  ent public.attendance_marks%ROWTYPE;
  sai public.attendance_marks%ROWTYPE;
BEGIN
  IF p_student_id IS NULL OR p_day_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO st
  FROM public.students
  WHERE id = p_student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT m.* INTO ent
  FROM public.attendance_marks m
  JOIN public.attendance_calls c ON c.id = m.call_id
  WHERE m.student_id = st.id
    AND c.day_date = p_day_date
    AND m.phase = 'entrada'
  ORDER BY m.marked_at DESC NULLS LAST
  LIMIT 1;

  SELECT m.* INTO sai
  FROM public.attendance_marks m
  JOIN public.attendance_calls c ON c.id = m.call_id
  WHERE m.student_id = st.id
    AND c.day_date = p_day_date
    AND m.phase = 'saida'
  ORDER BY m.marked_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', st.id,
    'school_id', st.school_id,
    'class_code', st.class_code,
    'day_date', p_day_date,
    'entrada', CASE WHEN ent.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', ent.status,
      'locked', coalesce(ent.locked, false),
      'source', coalesce(ent.source, 'manual'),
      'marked_at', ent.marked_at,
      'justification', ent.justification
    ) END,
    'saida', CASE WHEN sai.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', sai.status,
      'locked', coalesce(sai.locked, false),
      'source', coalesce(sai.source, 'manual'),
      'marked_at', sai.marked_at,
      'justification', sai.justification
    ) END
  );
END;
$$;

COMMENT ON FUNCTION public.student_portal_attendance_day(uuid, date) IS
  'Portal do Aluno: entrada/saída do dia (inclui batidas faciais), sem exigir auth.users.';

REVOKE ALL ON FUNCTION public.student_portal_attendance_day(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_attendance_day(uuid, date) TO anon, authenticated;

-- Intervalo (histórico / resumo do portal)
CREATE OR REPLACE FUNCTION public.student_portal_attendance_range(
  p_student_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  days jsonb := '{}'::jsonb;
  r record;
  day_key text;
  phase_obj jsonb;
BEGIN
  IF p_student_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN NULL;
  END IF;

  SELECT * INTO st
  FROM public.students
  WHERE id = p_student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT
      c.day_date,
      m.phase,
      m.status,
      coalesce(m.locked, false) AS locked,
      coalesce(m.source, 'manual') AS source,
      m.marked_at,
      m.justification
    FROM public.attendance_marks m
    JOIN public.attendance_calls c ON c.id = m.call_id
    WHERE m.student_id = st.id
      AND c.day_date BETWEEN p_from AND p_to
      AND m.phase IN ('entrada', 'saida')
    ORDER BY c.day_date, m.phase, m.marked_at DESC NULLS LAST
  LOOP
    day_key := to_char(r.day_date, 'YYYY-MM-DD');
    IF NOT (days ? day_key) THEN
      days := days || jsonb_build_object(
        day_key,
        jsonb_build_object('entrada', NULL, 'saida', NULL)
      );
    END IF;

    -- Mantém a marca mais recente por fase (ORDER BY marked_at DESC)
    IF (days -> day_key -> r.phase) IS NULL
       OR jsonb_typeof(days -> day_key -> r.phase) = 'null' THEN
      phase_obj := jsonb_build_object(
        'status', r.status,
        'locked', r.locked,
        'source', r.source,
        'marked_at', r.marked_at,
        'justification', r.justification
      );
      days := jsonb_set(days, ARRAY[day_key, r.phase], phase_obj, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', st.id,
    'school_id', st.school_id,
    'class_code', st.class_code,
    'from', p_from,
    'to', p_to,
    'days', days
  );
END;
$$;

COMMENT ON FUNCTION public.student_portal_attendance_range(uuid, date, date) IS
  'Portal do Aluno: marcas de frequência no intervalo (para histórico e resumo).';

REVOKE ALL ON FUNCTION public.student_portal_attendance_range(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_attendance_range(uuid, date, date) TO anon, authenticated;
