-- SIGA EDUCA — Religa o administrador ao banco para gravar escolas e demais cadastros.
-- Os perfis tinham sido apagados; is_system_admin() ficava sempre falso e o RLS
-- recusava INSERT/UPDATE em public.schools.

INSERT INTO public.profiles (id, email, full_name, role, is_system_admin)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  CASE
    WHEN lower(u.email) = lower('sigaeduca@escola.seduc.pa.gov.br')
      OR COALESCE((u.raw_app_meta_data->>'sistema_admin')::boolean, false)
    THEN 'Administrador do Sistema'
    ELSE COALESCE(u.raw_app_meta_data->>'role', 'servidor')
  END,
  lower(u.email) = lower('sigaeduca@escola.seduc.pa.gov.br')
    OR COALESCE((u.raw_app_meta_data->>'sistema_admin')::boolean, false)
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  is_system_admin = public.profiles.is_system_admin OR EXCLUDED.is_system_admin,
  role = CASE
    WHEN public.profiles.is_system_admin OR EXCLUDED.is_system_admin
      THEN 'Administrador do Sistema'
    ELSE public.profiles.role
  END,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.is_system_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
  OR lower(COALESCE(auth.jwt()->>'email', '')) = lower('sigaeduca@escola.seduc.pa.gov.br');
$$;

REVOKE ALL ON FUNCTION public.is_system_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
