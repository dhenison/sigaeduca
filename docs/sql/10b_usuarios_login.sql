-- SIGA EDUCA — Login / vínculo Auth dos Usuários (school_staff)
-- Projeto: digjzihjboflcuftmokj
-- Execute após 10_usuarios.sql
--
-- Resolve: cadastro na UI só ia para localStorage → login falhava.
-- Este SQL permite:
--   1) login por hash do colaborador (RPC para anon)
--   2) vincular auth.users + membership após criar conta Auth no cliente

-- =========================================================
-- 1) Login do servidor pelo hash (mesmo algoritmo do app)
-- =========================================================

CREATE OR REPLACE FUNCTION public.staff_login_by_hash(
  p_email text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.school_staff%ROWTYPE;
BEGIN
  IF p_email IS NULL OR length(btrim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;
  IF p_password_hash IS NULL OR length(btrim(p_password_hash)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO st
  FROM public.school_staff
  WHERE lower(email) = lower(btrim(p_email))
    AND status = 'Ativo'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF st.password_hash IS NULL OR btrim(st.password_hash) = '' THEN
    RETURN NULL;
  END IF;

  IF st.needs_password_set IS TRUE THEN
    RETURN NULL;
  END IF;

  IF st.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;

  UPDATE public.school_staff
  SET last_access_at = now(),
      updated_at = now()
  WHERE id = st.id;

  RETURN jsonb_build_object(
    'id', st.id,
    'nome', st.full_name,
    'email', st.email,
    'role', st.role,
    'school_id', st.school_id,
    'user_id', st.user_id,
    'employee_id', st.employee_id,
    'avatar_url', st.avatar_url
  );
END;
$$;

COMMENT ON FUNCTION public.staff_login_by_hash(text, text) IS
  'Valida e-mail + password_hash de school_staff (hash gerado no cliente SigaSecurity). Não devolve o hash.';

REVOKE ALL ON FUNCTION public.staff_login_by_hash(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_login_by_hash(text, text) TO anon, authenticated;

-- =========================================================
-- 2) Vincular Auth + membership (chamado pelo admin autenticado)
-- =========================================================

CREATE OR REPLACE FUNCTION public.link_staff_auth_user(
  p_staff_id uuid,
  p_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.school_staff%ROWTYPE;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO st FROM public.school_staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT public.user_can_access_school(st.school_id) AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Sem acesso à escola do colaborador';
  END IF;

  UPDATE public.school_staff
  SET user_id = p_auth_user_id,
      updated_at = now()
  WHERE id = p_staff_id;

  -- Profile (colunas essenciais)
  INSERT INTO public.profiles (id, email, full_name, role, school_id, is_system_admin)
  VALUES (
    p_auth_user_id,
    st.email,
    st.full_name,
    st.role,
    st.school_id,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    school_id = COALESCE(public.profiles.school_id, EXCLUDED.school_id);

  v_role := public.map_staff_role_to_membership(st.role);

  IF EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = st.school_id AND user_id = p_auth_user_id
  ) THEN
    UPDATE public.school_memberships
    SET role = v_role,
        is_active = true,
        staff_id = st.id,
        status = 'Ativo',
        updated_at = now()
    WHERE school_id = st.school_id AND user_id = p_auth_user_id;
  ELSE
    INSERT INTO public.school_memberships (school_id, user_id, role, is_active, staff_id, status)
    VALUES (st.school_id, p_auth_user_id, v_role, true, st.id, 'Ativo');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.link_staff_auth_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_staff_auth_user(uuid, uuid) TO authenticated;

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT public.staff_login_by_hash('email@escola.seduc.pa.gov.br', 'sha256:...');
-- SELECT proname FROM pg_proc WHERE proname IN ('staff_login_by_hash','link_staff_auth_user');
