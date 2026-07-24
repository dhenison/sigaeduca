-- SIGA EDUCA — Login do Portal do Aluno (students)
-- Projeto: digjzihjboflcuftmokj
-- Permite aluno real autenticar com e-mail institucional + hash (mesmo algoritmo do app).

CREATE OR REPLACE FUNCTION public.student_login_by_hash(
  p_email text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
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
  WHERE lower(email) = lower(btrim(p_email))
    AND coalesce(status, 'Ativo') = 'Ativo'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF st.password_hash IS NULL OR btrim(st.password_hash) = '' THEN
    RETURN NULL;
  END IF;

  IF coalesce(st.needs_password_set, false) IS TRUE THEN
    RETURN NULL;
  END IF;

  IF st.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;

  UPDATE public.students
  SET updated_at = now()
  WHERE id = st.id;

  RETURN jsonb_build_object(
    'id', st.id,
    'school_id', st.school_id,
    'nome', st.full_name,
    'email', st.email,
    'turma', st.class_code,
    'serie', st.serie,
    'turno', st.turno,
    'avatar_url', st.avatar_url,
    'codigo_inep', st.codigo_inep,
    'cpf', st.cpf,
    'birth_date', st.birth_date,
    'guardian_contact', st.guardian_contact,
    'guardian_name', st.guardian_name,
    'status', st.status
  );
END;
$$;

COMMENT ON FUNCTION public.student_login_by_hash(text, text) IS
  'Login do Portal do Aluno: e-mail @aluno.seduc.pa.gov.br + password_hash (cliente). Não devolve o hash.';

REVOKE ALL ON FUNCTION public.student_login_by_hash(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_login_by_hash(text, text) TO anon, authenticated;

-- Recuperação / definição de senha do aluno (CPF + data nascimento)
CREATE OR REPLACE FUNCTION public.student_set_password_by_identity(
  p_cpf text,
  p_birth_date date,
  p_password_hash text
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
  IF p_password_hash IS NULL OR length(btrim(p_password_hash)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hash_vazio');
  END IF;
  cpf_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  IF length(cpf_digits) < 11 OR p_birth_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'dados_invalidos');
  END IF;

  SELECT * INTO st
  FROM public.students
  WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = cpf_digits
    AND birth_date = p_birth_date
    AND coalesce(status, 'Ativo') = 'Ativo'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  UPDATE public.students
  SET password_hash = btrim(p_password_hash),
      needs_password_set = false,
      updated_at = now()
  WHERE id = st.id
  RETURNING * INTO st;

  RETURN jsonb_build_object(
    'ok', true,
    'id', st.id,
    'school_id', st.school_id,
    'nome', st.full_name,
    'email', st.email,
    'turma', st.class_code,
    'avatar_url', st.avatar_url
  );
END;
$$;

COMMENT ON FUNCTION public.student_set_password_by_identity(text, date, text) IS
  'Define senha do portal do aluno validando CPF + data de nascimento.';

REVOKE ALL ON FUNCTION public.student_set_password_by_identity(text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_set_password_by_identity(text, date, text) TO anon, authenticated;

-- Perfil do aluno logado (espelho para o portal após login)
CREATE OR REPLACE FUNCTION public.student_portal_profile(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
BEGIN
  IF p_student_id IS NULL THEN
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
    'codigo_inep', st.codigo_inep,
    'cpf', st.cpf,
    'birth_date', st.birth_date,
    'guardian_contact', st.guardian_contact,
    'guardian_name', st.guardian_name,
    'status', st.status,
    'attendance_pct', st.attendance_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_profile(uuid) TO anon, authenticated;

-- Lookup por CPF + nascimento (recuperar senha)
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
    'school_id', st.school_id,
    'nome', st.full_name,
    'email', st.email,
    'turma', st.class_code,
    'avatar_url', st.avatar_url,
    'needs_password_set', coalesce(st.needs_password_set, true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_lookup_by_identity(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_lookup_by_identity(text, date) TO anon, authenticated;
