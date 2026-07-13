-- SIGA EDUCA — Revoga staff_login_by_hash de anon/authenticated
-- Login cloud passa a ser apenas Supabase Auth (signInWithPassword).
-- Pré-requisito: usuários ativos têm conta em Authentication (via cadastro Usuários).

REVOKE ALL ON FUNCTION public.staff_login_by_hash(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_login_by_hash(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.staff_login_by_hash(text, text) FROM authenticated;

COMMENT ON FUNCTION public.staff_login_by_hash(text, text) IS
  'DEPRECATED: login por hash desativado na API. Use Supabase Auth. Função mantida só para referência/admin SQL.';
