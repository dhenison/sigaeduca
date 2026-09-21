-- Fecha exposição do anon: TRUNCATE nas tabelas, login de servidor sem uso
-- e leitura do portal do aluno só com a sessão emitida no login.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS portal_session_hash text,
  ADD COLUMN IF NOT EXISTS portal_session_expires timestamptz;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'set_updated_at',
        'set_profiles_updated_at',
        'map_staff_role_to_membership',
        'staff_login_by_hash'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('list_admin_school_documents', 'upsert_admin_school_document')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.student_portal_token_ok(p_student_id uuid, p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT p_student_id IS NOT NULL
    AND p_token IS NOT NULL
    AND length(btrim(p_token)) >= 32
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = p_student_id
        AND s.portal_session_hash IS NOT NULL
        AND s.portal_session_expires > now()
        AND s.portal_session_hash = encode(extensions.digest(convert_to(btrim(p_token), 'utf8'), 'sha256'), 'hex')
        AND coalesce(s.status, 'Ativo') = 'Ativo'
    );
$$;

REVOKE ALL ON FUNCTION public.student_portal_token_ok(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.student_login_by_hash(
  p_email text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  st public.students%ROWTYPE;
  v_token text;
BEGIN
  IF p_email IS NULL OR length(btrim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;
  IF p_password_hash IS NULL OR length(btrim(p_password_hash)) = 0 THEN
    RETURN NULL;
  END IF;
  IF lower(btrim(p_email)) NOT LIKE '%@aluno.seduc.pa.gov.br' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO st
  FROM public.students
  WHERE coalesce(status, 'Ativo') = 'Ativo'
    AND (
      lower(email) = lower(btrim(p_email))
      OR (
        lower(split_part(coalesce(email, ''), '@', 1)) = lower(split_part(btrim(p_email), '@', 1))
        AND lower(split_part(coalesce(email, ''), '@', 2)) IN (
          'aluno.seduc.pa.gov.br',
          'escola.seduc.pa.gov.br'
        )
      )
    )
  ORDER BY
    CASE WHEN lower(email) = lower(btrim(p_email)) THEN 0 ELSE 1 END,
    updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR st.password_hash IS NULL OR btrim(st.password_hash) = '' THEN
    RETURN NULL;
  END IF;
  IF coalesce(st.needs_password_set, false) IS TRUE THEN
    RETURN NULL;
  END IF;
  IF st.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE public.students
  SET updated_at = now(),
      portal_session_hash = encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex'),
      portal_session_expires = now() + interval '12 hours'
  WHERE id = st.id;

  RETURN jsonb_build_object(
    'id', st.id,
    'school_id', st.school_id,
    'nome', st.full_name,
    'email', lower(btrim(p_email)),
    'turma', st.class_code,
    'serie', st.serie,
    'turno', st.turno,
    'avatar_url', st.avatar_url,
    'status', st.status,
    'portal_token', v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_login_by_hash(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login_by_hash(text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.student_portal_profile(uuid);
CREATE FUNCTION public.student_portal_profile(p_student_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', st.id,
    'school_id', st.school_id,
    'nome', st.full_name,
    'email', st.email,
    'turma', st.class_code,
    'serie', st.serie,
    'turno', st.turno,
    'avatar_url', st.avatar_url,
    'status', st.status,
    'attendance_pct', st.attendance_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_profile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_profile(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.student_portal_attendance_day(uuid, date);
CREATE FUNCTION public.student_portal_attendance_day(
  p_student_id uuid,
  p_day_date date,
  p_token text
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
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN NULL;
  END IF;
  IF p_day_date IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT m.* INTO ent
  FROM public.attendance_marks m
  JOIN public.attendance_calls c ON c.id = m.call_id
  WHERE m.student_id = st.id AND c.day_date = p_day_date AND m.phase = 'entrada'
  ORDER BY m.marked_at DESC NULLS LAST
  LIMIT 1;
  SELECT m.* INTO sai
  FROM public.attendance_marks m
  JOIN public.attendance_calls c ON c.id = m.call_id
  WHERE m.student_id = st.id AND c.day_date = p_day_date AND m.phase = 'saida'
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

REVOKE ALL ON FUNCTION public.student_portal_attendance_day(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_attendance_day(uuid, date, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.student_portal_attendance_range(uuid, date, date);
CREATE FUNCTION public.student_portal_attendance_range(
  p_student_id uuid,
  p_from date,
  p_to date,
  p_token text
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
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN NULL;
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN NULL;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  FOR r IN
    SELECT c.day_date, m.phase, m.status,
      coalesce(m.locked, false) AS locked,
      coalesce(m.source, 'manual') AS source,
      m.marked_at, m.justification
    FROM public.attendance_marks m
    JOIN public.attendance_calls c ON c.id = m.call_id
    WHERE m.student_id = st.id
      AND c.day_date BETWEEN p_from AND p_to
      AND m.phase IN ('entrada', 'saida')
    ORDER BY c.day_date, m.phase, m.marked_at DESC NULLS LAST
  LOOP
    day_key := to_char(r.day_date, 'YYYY-MM-DD');
    IF NOT (days ? day_key) THEN
      days := days || jsonb_build_object(day_key, jsonb_build_object('entrada', NULL, 'saida', NULL));
    END IF;
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

REVOKE ALL ON FUNCTION public.student_portal_attendance_range(uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_attendance_range(uuid, date, date, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.student_portal_informativos(uuid);
CREATE FUNCTION public.student_portal_informativos(p_student_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  result jsonb;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id LIMIT 1;
  IF NOT FOUND OR st.school_id IS NULL OR coalesce(st.status, 'Ativo') <> 'Ativo' THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_at DESC NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT i.local_id AS id, i.title, i.body_text, i.image_data, i.layout, i.audience,
      i.class_codes, i.published_at, i.expires_at, i.created_by_name,
      coalesce(i.published_at, i.created_at) AS sort_at
    FROM public.portal_informativos i
    WHERE i.school_id = st.school_id
      AND i.status = 'publicado'
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (
        i.audience = 'todos'
        OR (i.audience = 'turmas' AND st.class_code IS NOT NULL AND st.class_code = ANY (i.class_codes))
      )
    ORDER BY coalesce(i.published_at, i.created_at) DESC
    LIMIT 50
  ) x;
  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_informativos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_informativos(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.student_lookup_by_identity(
  p_cpf text,
  p_birth_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  cpf_digits text;
BEGIN
  cpf_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  IF length(cpf_digits) < 11 OR p_birth_date IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO st
  FROM public.students
  WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = cpf_digits
    AND birth_date = p_birth_date
    AND coalesce(status, 'Ativo') = 'Ativo'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', st.id,
    'nome', st.full_name,
    'email', st.email,
    'needs_password_set', coalesce(st.needs_password_set, true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_lookup_by_identity(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_lookup_by_identity(text, date) TO anon, authenticated;
