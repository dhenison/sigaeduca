-- SIGA EDUCA — Menu 17: Meu Perfil
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: profiles, schools, school_staff (10_usuarios.sql), user_can_access_school(), set_updated_at()
-- App hoje: localStorage siga_profile_*, siga_session, avatar compartilhado com siga_users / school_staff
--
-- Escopo:
--   • Dados pessoais + foto única (profiles ↔ school_staff.avatar_url)
--   • Segurança da conta: senha (timestamp), 2FA, sessões ativas
--   • Somente usuários/servidores (não alunos)
--
-- NÃO inclui a tela Permissões — ver 18_permissoes.sql

-- =========================================================
-- 1) Segurança / preferências em public.profiles
-- =========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_method text,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_updated_at timestamptz NOT NULL DEFAULT now();

-- Garante colunas de Usuários mesmo se 10_usuarios ainda não rodou
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS social jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lattes_url text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS last_access_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_two_factor_method_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_two_factor_method_chk
  CHECK (
    two_factor_method IS NULL
    OR two_factor_method = ANY (ARRAY['app'::text, 'sms'::text])
  );

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_size_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_size_chk
  CHECK (avatar_url IS NULL OR octet_length(avatar_url) <= 180000);

COMMENT ON COLUMN public.profiles.two_factor_enabled IS 'Meu Perfil → Autenticação em Dois Fatores (2FA)';
COMMENT ON COLUMN public.profiles.two_factor_method IS 'app | sms (quando 2FA ativo)';
COMMENT ON COLUMN public.profiles.password_changed_at IS 'Última alteração de senha (hint na UI)';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Foto única do servidor (sincronizada com school_staff.avatar_url)';
COMMENT ON COLUMN public.profiles.bio IS 'Resumo profissional (Meu Perfil)';
COMMENT ON COLUMN public.profiles.phone IS 'Telefone / WhatsApp';

CREATE OR REPLACE FUNCTION public.sync_profile_meu_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.bio := NULLIF(btrim(COALESCE(NEW.bio, '')), '');
  NEW.avatar_url := NULLIF(NEW.avatar_url, '');
  NEW.two_factor_method := NULLIF(lower(btrim(COALESCE(NEW.two_factor_method, ''))), '');

  IF NEW.avatar_url IS NOT NULL AND octet_length(NEW.avatar_url) > 180000 THEN
    RAISE EXCEPTION 'Foto do perfil excede 180KB. Otimize no cliente (upload/câmera).';
  END IF;

  IF NEW.two_factor_enabled IS DISTINCT FROM true THEN
    NEW.two_factor_enabled := false;
    NEW.two_factor_method := NULL;
  END IF;

  NEW.profile_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_meu_perfil ON public.profiles;
CREATE TRIGGER trg_profiles_meu_perfil
  BEFORE UPDATE OF phone, bio, avatar_url, two_factor_enabled, two_factor_method, password_changed_at
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_meu_perfil();

-- =========================================================
-- 2) Foto única: espelha avatar profiles ↔ school_staff
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_avatar_profile_to_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
    RETURN NEW;
  END IF;

  UPDATE public.school_staff s
  SET avatar_url = NEW.avatar_url,
      updated_at = now()
  WHERE s.user_id = NEW.id
     OR lower(s.email) = lower(COALESCE(NEW.email, ''));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_avatar_staff ON public.profiles;
CREATE TRIGGER trg_profiles_sync_avatar_staff
  AFTER UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_avatar_profile_to_staff();

CREATE OR REPLACE FUNCTION public.sync_avatar_staff_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles p
    SET avatar_url = NEW.avatar_url,
        profile_updated_at = now()
    WHERE p.id = NEW.user_id
      AND p.avatar_url IS DISTINCT FROM NEW.avatar_url;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_staff_sync_avatar_profile ON public.school_staff;
CREATE TRIGGER trg_school_staff_sync_avatar_profile
  AFTER UPDATE OF avatar_url ON public.school_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_avatar_staff_to_profile();

-- =========================================================
-- 3) Sessões ativas  →  public.user_sessions
-- =========================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  session_token text,
  device_label text NOT NULL DEFAULT 'Dispositivo',
  browser_label text,
  user_agent text,
  ip_address text,
  location_label text,
  is_current boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_sessions_device_not_blank CHECK (length(btrim(device_label)) > 0)
);

COMMENT ON TABLE public.user_sessions IS 'Sessões ativas do Meu Perfil (dispositivos/navegadores)';
COMMENT ON COLUMN public.user_sessions.is_current IS 'Marca a sessão deste navegador';
COMMENT ON COLUMN public.user_sessions.revoked_at IS 'Preenchido ao Encerrar sessão remota';
COMMENT ON COLUMN public.user_sessions.location_label IS 'Ex.: São Paulo, BR (opcional)';

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON public.user_sessions (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx
  ON public.user_sessions (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_sessions_school_idx
  ON public.user_sessions (school_id)
  WHERE school_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_user_sessions_updated ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_updated
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_user_session_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.device_label := btrim(COALESCE(NULLIF(btrim(NEW.device_label), ''), 'Dispositivo'));
  NEW.browser_label := NULLIF(btrim(COALESCE(NEW.browser_label, '')), '');
  NEW.location_label := NULLIF(btrim(COALESCE(NEW.location_label, '')), '');
  NEW.ip_address := NULLIF(btrim(COALESCE(NEW.ip_address, '')), '');
  NEW.user_agent := NULLIF(NEW.user_agent, '');
  NEW.session_token := NULLIF(btrim(COALESCE(NEW.session_token, '')), '');

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := COALESCE(NEW.user_id, auth.uid());
    NEW.last_seen_at := COALESCE(NEW.last_seen_at, now());
  END IF;

  IF NEW.revoked_at IS NOT NULL THEN
    NEW.is_current := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_sessions_sync ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_sync
  BEFORE INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_session_fields();

-- Só uma sessão "atual" por usuário
CREATE OR REPLACE FUNCTION public.ensure_single_current_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_current IS TRUE AND NEW.revoked_at IS NULL THEN
    UPDATE public.user_sessions
    SET is_current = false,
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND id IS DISTINCT FROM NEW.id
      AND is_current IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_sessions_single_current ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_single_current
  AFTER INSERT OR UPDATE OF is_current ON public.user_sessions
  FOR EACH ROW
  WHEN (NEW.is_current IS TRUE)
  EXECUTE FUNCTION public.ensure_single_current_session();

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_select_own ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_insert_own ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_update_own ON public.user_sessions;
DROP POLICY IF EXISTS user_sessions_delete_own ON public.user_sessions;

CREATE POLICY user_sessions_select_own ON public.user_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_system_admin()
  );

CREATE POLICY user_sessions_insert_own ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_sessions_update_own ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_system_admin());

CREATE POLICY user_sessions_delete_own ON public.user_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_sessions TO authenticated;

-- =========================================================
-- 4) Helpers de Meu Perfil
-- =========================================================

CREATE OR REPLACE FUNCTION public.mark_password_changed(p_user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL OR (p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_system_admin()) THEN
    RAISE EXCEPTION 'Não autorizado a marcar alteração de senha';
  END IF;

  UPDATE public.profiles
  SET password_changed_at = now(),
      profile_updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.user_sessions
  SET revoked_at = now(),
      is_current = false,
      updated_at = now()
  WHERE id = p_session_id
    AND revoked_at IS NULL
    AND (user_id = auth.uid() OR public.is_system_admin());

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_password_changed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_session(uuid) TO authenticated;

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND column_name IN (
--     'phone','bio','avatar_url','two_factor_enabled','two_factor_method','password_changed_at'
--   );
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'user_sessions';
