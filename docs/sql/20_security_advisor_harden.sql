-- SIGA EDUCA — Endurecimento Security Advisor (WARN)
-- Projeto: digjzihjboflcuftmokj
-- Fonte: docs/Supabase Performance Security Lints (...).csv
--
-- O que este script faz:
--  1) Fixa search_path nas 3 funções flagadas (lint 0011)
--  2) Remove EXECUTE de PUBLIC/anon em funções SECURITY DEFINER (lint 0028)
--  3) Remove EXECUTE de authenticated em funções só de trigger (lint 0029)
--  4) Reabre GRANT EXECUTE TO authenticated nas RPCs usadas pelo frontend
--
-- O que NÃO resolve (Dashboard):
--  Auth → Password → Enable "Leaked password protection" (HaveIBeenPwned)
--
-- Execute no SQL Editor. Revise a lista de RPCs se o app passar a chamar outras.

-- =========================================================
-- 1) search_path mutável (lint 0011)
-- =========================================================
-- Assinaturas reais no projeto (não inventar () vazio):
ALTER FUNCTION public.set_profiles_updated_at()
  SET search_path TO 'public';

ALTER FUNCTION public.set_updated_at()
  SET search_path TO 'public';

ALTER FUNCTION public.map_staff_role_to_membership(p_role text)
  SET search_path TO 'public';

-- =========================================================
-- 2) Baseline: ninguém anônimo executa RPC DEFINER
-- =========================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.schema_name, r.func_name, r.args
    );
  END LOOP;
END $$;

-- =========================================================
-- 3) Triggers / sync / normalize: também sem authenticated via RPC
--    (triggers continuam a rodar como owner da função)
-- =========================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proname LIKE 'sync_%'
        OR p.proname LIKE 'normalize_%'
        OR p.proname LIKE 'trg_%'
        OR p.proname IN (
          'set_schools_audit',
          'handle_new_user',
          'set_updated_at',
          'set_profiles_updated_at',
          'map_staff_role_to_membership'
        )
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.schema_name, r.func_name, r.args
    );
  END LOOP;
END $$;

-- =========================================================
-- 4) RPCs do aplicativo — só authenticated (lint 0029 aceito com checks)
--    Ajuste se alguma assinatura no banco for diferente.
-- =========================================================

-- Lotação
GRANT EXECUTE ON FUNCTION public.lotacao_replace_mapa(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.minha_lotacao_rows(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.turma_lotacao_rows(text, integer) TO authenticated;

-- Alunos AEE
GRANT EXECUTE ON FUNCTION public.set_student_aee_codes(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_aee_codes(uuid) TO authenticated;

-- Usuários / sessão / permissões (usados ou auxiliares do painel)
GRANT EXECUTE ON FUNCTION public.link_staff_auth_user(uuid, uuid) TO authenticated;
-- staff_login_by_hash: NÃO conceder a anon/authenticated (ver 21_revoke_staff_login_by_hash.sql)
GRANT EXECUTE ON FUNCTION public.mark_password_changed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_single_current_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_role_defaults_to_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_role_default(text, text, boolean, boolean, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_permissions_meta(uuid) TO authenticated;

-- Secretaria
GRANT EXECUTE ON FUNCTION public.next_secretary_protocol(uuid, text, integer) TO authenticated;

-- Helpers usados por policies / app
GRANT EXECUTE ON FUNCTION public.user_can_access_school(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- staff_login_by_hash: revogado da API (21_revoke_staff_login_by_hash.sql). Login = Supabase Auth.

COMMENT ON SCHEMA public IS
  'Após 20+21 harden: DEFINER sem anon; staff_login_by_hash fora da API; triggers sem RPC.';
