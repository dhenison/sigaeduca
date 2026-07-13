-- SIGA EDUCA — Menu 10: Usuários
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, profiles, school_memberships, user_can_access_school()
-- App hoje: localStorage siga_users
--
-- Modelo:
--   1) public.school_staff     → cadastro do colaborador NA escola (fonte da tela Usuários)
--   2) profiles (extras)       → dados de perfil quando houver Auth
--   3) school_memberships      → vínculo Auth ↔ escola (acesso RLS), enriquecido

-- =========================================================
-- 1) Colaboradores da escola  →  public.school_staff
-- =========================================================

CREATE TABLE IF NOT EXISTS public.school_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  employee_id text NOT NULL,
  subject text,
  phone text,
  social jsonb NOT NULL DEFAULT '{}'::jsonb,
  lattes_url text,
  bio text,
  avatar_url text,
  cpf text,
  birth_date date,
  status text NOT NULL DEFAULT 'Ativo',
  last_access_at timestamptz,
  needs_password_set boolean NOT NULL DEFAULT true,
  password_hash text,
  invited_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_staff_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT school_staff_email_not_blank CHECK (length(btrim(email)) > 0),
  CONSTRAINT school_staff_employee_not_blank CHECK (length(btrim(employee_id)) > 0),
  CONSTRAINT school_staff_role_chk CHECK (
    role = ANY (ARRAY[
      'Diretor'::text,
      'Vice-diretor Administrativo'::text,
      'Vice-diretor Pedagógico'::text,
      'Coordenador'::text,
      'Secretario(a) Escolar'::text,
      'Professor(a)'::text,
      'Administrador do Sistema'::text,
      'servidor'::text
    ])
  ),
  CONSTRAINT school_staff_status_chk CHECK (
    status = ANY (ARRAY['Ativo'::text, 'Inativo'::text])
  ),
  CONSTRAINT school_staff_email_domain_chk CHECK (
    lower(email) LIKE '%@escola.seduc.pa.gov.br'
    OR lower(email) = 'sigaeduca@escola.seduc.pa.gov.br'
  )
);

-- Garante colunas novas mesmo se a tabela já existia (CREATE IF NOT EXISTS não altera)
ALTER TABLE public.school_staff
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS social jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lattes_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Ativo',
  ADD COLUMN IF NOT EXISTS last_access_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_password_set boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.school_staff IS 'Usuários/colaboradores por escola (tela Usuários)';
COMMENT ON COLUMN public.school_staff.role IS 'cargo/função no app';
COMMENT ON COLUMN public.school_staff.employee_id IS 'matriculaSemVinculo no app';
COMMENT ON COLUMN public.school_staff.subject IS 'disciplinaPrincipal';
COMMENT ON COLUMN public.school_staff.social IS 'redes: {instagram,x,facebook}';
COMMENT ON COLUMN public.school_staff.user_id IS 'auth.users quando o colaborador já tem login Supabase';
COMMENT ON COLUMN public.school_staff.password_hash IS 'Hash da senha definida no cadastro (nunca gravar senha em claro)';
COMMENT ON COLUMN public.school_staff.needs_password_set IS 'false quando a senha já foi definida no cadastro/edição';
COMMENT ON COLUMN public.school_staff.avatar_url IS 'Foto do perfil: JPEG otimizado no cliente (~512px, <180KB texto). Upload ou câmera.';

ALTER TABLE public.school_staff DROP CONSTRAINT IF EXISTS school_staff_avatar_size_chk;
ALTER TABLE public.school_staff
  ADD CONSTRAINT school_staff_avatar_size_chk
  CHECK (avatar_url IS NULL OR octet_length(avatar_url) <= 180000);

CREATE UNIQUE INDEX IF NOT EXISTS school_staff_school_email_unique
  ON public.school_staff (school_id, lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS school_staff_school_employee_unique
  ON public.school_staff (school_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS school_staff_school_user_unique
  ON public.school_staff (school_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS school_staff_school_idx ON public.school_staff (school_id);
CREATE INDEX IF NOT EXISTS school_staff_role_idx ON public.school_staff (school_id, role);
CREATE INDEX IF NOT EXISTS school_staff_status_idx ON public.school_staff (school_id, status);
CREATE INDEX IF NOT EXISTS school_staff_user_idx ON public.school_staff (user_id);

DROP TRIGGER IF EXISTS trg_school_staff_updated ON public.school_staff;
CREATE TRIGGER trg_school_staff_updated
  BEFORE UPDATE ON public.school_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_school_staff_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  NEW.email := lower(btrim(NEW.email));
  NEW.employee_id := btrim(NEW.employee_id);
  NEW.subject := NULLIF(btrim(COALESCE(NEW.subject, '')), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.lattes_url := NULLIF(btrim(COALESCE(NEW.lattes_url, '')), '');
  NEW.bio := NULLIF(btrim(COALESCE(NEW.bio, '')), '');
  NEW.cpf := NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), '');
  NEW.social := COALESCE(NEW.social, '{}'::jsonb);
  NEW.avatar_url := NULLIF(NEW.avatar_url, '');

  IF NEW.avatar_url IS NOT NULL AND octet_length(NEW.avatar_url) > 180000 THEN
    RAISE EXCEPTION 'Foto do usuário excede 180KB. Otimize no cadastro (upload/câmera).';
  END IF;

  IF NEW.password_hash IS NOT NULL AND length(btrim(NEW.password_hash)) > 0 THEN
    NEW.needs_password_set := false;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_staff_sync ON public.school_staff;
CREATE TRIGGER trg_school_staff_sync
  BEFORE INSERT OR UPDATE ON public.school_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_school_staff_fields();

ALTER TABLE public.school_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_staff_select ON public.school_staff;
DROP POLICY IF EXISTS school_staff_insert ON public.school_staff;
DROP POLICY IF EXISTS school_staff_update ON public.school_staff;
DROP POLICY IF EXISTS school_staff_delete ON public.school_staff;

CREATE POLICY school_staff_select ON public.school_staff
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY school_staff_insert ON public.school_staff
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY school_staff_update ON public.school_staff
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY school_staff_delete ON public.school_staff
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_staff TO authenticated;

-- =========================================================
-- 2) Enriquecer profiles (dados pessoais do servidor)
-- =========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS social jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lattes_url text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS last_access_at timestamptz;

COMMENT ON COLUMN public.profiles.employee_id IS 'Matrícula sem vínculo (quando perfil global)';
COMMENT ON COLUMN public.profiles.subject IS 'Disciplina principal';
COMMENT ON COLUMN public.profiles.social IS 'Redes sociais {instagram,x,facebook}';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Foto de perfil otimizada (mesma regra leve do school_staff)';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_size_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_size_chk
  CHECK (avatar_url IS NULL OR octet_length(avatar_url) <= 180000);

-- =========================================================
-- 3) Enriquecer school_memberships (vínculo Auth ↔ escola)
-- =========================================================

ALTER TABLE public.school_memberships
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.school_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Ativo',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.school_memberships DROP CONSTRAINT IF EXISTS school_memberships_status_chk;
ALTER TABLE public.school_memberships
  ADD CONSTRAINT school_memberships_status_chk
  CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text]));

-- Amplia papéis aceitos no membership (além de 'servidor')
ALTER TABLE public.school_memberships DROP CONSTRAINT IF EXISTS school_memberships_role_chk;
ALTER TABLE public.school_memberships
  ADD CONSTRAINT school_memberships_role_chk
  CHECK (
    role = ANY (ARRAY[
      'servidor'::text,
      'diretor'::text,
      'admin_escola'::text,
      'secretario'::text,
      'secretaria'::text,
      'gestor'::text,
      'coordenador'::text,
      'professor'::text,
      'Diretor'::text,
      'Vice-diretor Administrativo'::text,
      'Vice-diretor Pedagógico'::text,
      'Coordenador'::text,
      'Secretario(a) Escolar'::text,
      'Professor(a)'::text
    ])
  );

CREATE INDEX IF NOT EXISTS school_memberships_staff_idx
  ON public.school_memberships (staff_id);

DROP TRIGGER IF EXISTS trg_school_memberships_updated ON public.school_memberships;
CREATE TRIGGER trg_school_memberships_updated
  BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 4) Helper: mapear função da UI → role de membership
-- =========================================================

CREATE OR REPLACE FUNCTION public.map_staff_role_to_membership(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role ILIKE 'Diretor%' THEN 'diretor'
    WHEN p_role ILIKE 'Vice-diretor%' THEN 'gestor'
    WHEN p_role ILIKE 'Coordenador%' THEN 'coordenador'
    WHEN p_role ILIKE 'Secretario%' OR p_role ILIKE 'secretaria%' THEN 'secretario'
    WHEN p_role ILIKE 'Professor%' THEN 'professor'
    ELSE 'servidor'
  END;
$$;

-- =========================================================
-- Exemplos (opcional)
-- =========================================================
-- INSERT INTO public.school_staff (
--   school_id, full_name, email, role, employee_id, subject, phone, bio
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'Maria Silva',
--   'maria.silva@escola.seduc.pa.gov.br',
--   'Professor(a)',
--   '123456',
--   'Matemática',
--   '(94) 99999-0000',
--   'Professora de Matemática.'
-- );

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'school_staff';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND column_name IN ('phone','bio','avatar_url','employee_id','subject','social');
