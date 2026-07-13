-- SIGA EDUCA — Menu 18: Permissões
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, school_staff (10_usuarios.sql), user_can_access_school(), set_updated_at(), is_system_admin()
-- App hoje: localStorage siga_user_permissions + siga_permissions_meta (js/permissoes.js)
--
-- Escopo SEPARADO do Meu Perfil:
--   • Catálogo de módulos do menu
--   • Modelo padrão por cargo (role)
--   • Permissões efetivas por colaborador (school_staff)
--
-- NÃO inclui segurança de conta / foto / sessões — ver 17_meu_perfil.sql

-- =========================================================
-- 1) Catálogo de módulos  →  public.permission_modules
-- =========================================================

CREATE TABLE IF NOT EXISTS public.permission_modules (
  id text PRIMARY KEY,
  label text NOT NULL,
  group_name text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_modules_id_not_blank CHECK (length(btrim(id)) > 0),
  CONSTRAINT permission_modules_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT permission_modules_group_not_blank CHECK (length(btrim(group_name)) > 0)
);

COMMENT ON TABLE public.permission_modules IS 'Módulos/menus do sistema para a tela Permissões';
COMMENT ON COLUMN public.permission_modules.id IS 'Ex.: turmas, alunos, meuperfil (mesmo id do app)';
COMMENT ON COLUMN public.permission_modules.group_name IS 'Principal | Administrativo | Pedagógico | Sistema';

DROP TRIGGER IF EXISTS trg_permission_modules_updated ON public.permission_modules;
CREATE TRIGGER trg_permission_modules_updated
  BEFORE UPDATE ON public.permission_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permission_modules (id, label, group_name, icon, sort_order) VALUES
  ('painelprincipal', 'Minha Escola', 'Principal', 'dashboard', 10),
  ('escola', 'Dados da Escola', 'Principal', 'apartment', 20),
  ('calendarioletivo', 'Calendário Letivo', 'Administrativo', 'calendar_today', 30),
  ('turmas', 'Turmas', 'Administrativo', 'groups', 40),
  ('alunos', 'Alunos', 'Administrativo', 'person', 50),
  ('fichadoaluno', 'Ficha do Aluno', 'Administrativo', 'badge', 60),
  ('frequencia', 'Frequência', 'Administrativo', 'fact_check', 70),
  ('horariodeaula', 'Horário de Aula', 'Administrativo', 'schedule', 80),
  ('agenda', 'Agenda', 'Administrativo', 'event', 90),
  ('ocorrencias', 'Ocorrências', 'Administrativo', 'warning', 100),
  ('documentossecretaria', 'Documentos Secretaria', 'Administrativo', 'description', 110),
  ('usuarios', 'Usuários', 'Administrativo', 'manage_accounts', 120),
  ('lotacao', 'Lotação', 'Administrativo', 'apartment', 130),
  ('topodosaber', 'Projeto Olímpico', 'Pedagógico', 'emoji_events', 140),
  ('boletins', 'Boletins', 'Pedagógico', 'menu_book', 150),
  ('conselho', 'Conselho de Classe', 'Pedagógico', 'diversity_3', 160),
  ('controlelivros', 'Controle de Livros', 'Pedagógico', 'auto_stories', 170),
  ('relatorios', 'Relatórios', 'Pedagógico', 'assessment', 180),
  ('meuperfil', 'Meu Perfil', 'Sistema', 'account_circle', 190),
  ('permissoes', 'Permissões', 'Sistema', 'shield_person', 200),
  ('paineladmin', 'Painel Admin', 'Sistema', 'admin_panel_settings', 210)
ON CONFLICT (id) DO UPDATE
SET
  label = EXCLUDED.label,
  group_name = EXCLUDED.group_name,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_modules_select ON public.permission_modules;
DROP POLICY IF EXISTS permission_modules_write_admin ON public.permission_modules;

CREATE POLICY permission_modules_select ON public.permission_modules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY permission_modules_write_admin ON public.permission_modules
  FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

GRANT SELECT ON TABLE public.permission_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.permission_modules TO authenticated;

-- =========================================================
-- 2) Padrão por cargo  →  public.role_permission_defaults
-- =========================================================
-- Espelha defaultForRole() de js/permissoes.js
-- school_id NULL = template global; preenchido = override da escola

CREATE TABLE IF NOT EXISTS public.role_permission_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  role text NOT NULL,
  module_id text NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permission_defaults_role_not_blank CHECK (length(btrim(role)) > 0)
);

COMMENT ON TABLE public.role_permission_defaults IS 'Permissões padrão por cargo (antes de customizar por usuário)';
COMMENT ON COLUMN public.role_permission_defaults.school_id IS 'NULL = padrão do sistema; senão, override da escola';
COMMENT ON COLUMN public.role_permission_defaults.can_view IS 'Ação ver';
COMMENT ON COLUMN public.role_permission_defaults.can_create IS 'Ação criar';
COMMENT ON COLUMN public.role_permission_defaults.can_edit IS 'Ação editar';
COMMENT ON COLUMN public.role_permission_defaults.can_delete IS 'Ação excluir';

CREATE UNIQUE INDEX IF NOT EXISTS role_permission_defaults_global_unique
  ON public.role_permission_defaults (lower(role), module_id)
  WHERE school_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS role_permission_defaults_school_unique
  ON public.role_permission_defaults (school_id, lower(role), module_id)
  WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS role_permission_defaults_role_idx
  ON public.role_permission_defaults (lower(role));

CREATE INDEX IF NOT EXISTS role_permission_defaults_school_idx
  ON public.role_permission_defaults (school_id);

DROP TRIGGER IF EXISTS trg_role_permission_defaults_updated ON public.role_permission_defaults;
CREATE TRIGGER trg_role_permission_defaults_updated
  BEFORE UPDATE ON public.role_permission_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permission_defaults_select ON public.role_permission_defaults;
DROP POLICY IF EXISTS role_permission_defaults_write ON public.role_permission_defaults;

CREATE POLICY role_permission_defaults_select ON public.role_permission_defaults
  FOR SELECT TO authenticated
  USING (
    school_id IS NULL
    OR public.user_can_access_school(school_id)
    OR public.is_system_admin()
  );

CREATE POLICY role_permission_defaults_write ON public.role_permission_defaults
  FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR (school_id IS NOT NULL AND public.user_can_access_school(school_id))
  )
  WITH CHECK (
    public.is_system_admin()
    OR (school_id IS NOT NULL AND public.user_can_access_school(school_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.role_permission_defaults TO authenticated;

-- Helper: grava um bloco de ações (idempotente sem depender de ON CONFLICT parcial)
CREATE OR REPLACE FUNCTION public.upsert_role_default(
  p_role text,
  p_module_id text,
  p_view boolean,
  p_create boolean,
  p_edit boolean,
  p_delete boolean,
  p_school_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := btrim(p_role);
BEGIN
  IF p_school_id IS NULL THEN
    UPDATE public.role_permission_defaults
    SET
      can_view = p_view,
      can_create = p_create,
      can_edit = p_edit,
      can_delete = p_delete,
      updated_at = now()
    WHERE school_id IS NULL
      AND lower(role) = lower(v_role)
      AND module_id = p_module_id;

    IF NOT FOUND THEN
      INSERT INTO public.role_permission_defaults (
        school_id, role, module_id, can_view, can_create, can_edit, can_delete
      ) VALUES (
        NULL, v_role, p_module_id, p_view, p_create, p_edit, p_delete
      );
    END IF;
  ELSE
    UPDATE public.role_permission_defaults
    SET
      can_view = p_view,
      can_create = p_create,
      can_edit = p_edit,
      can_delete = p_delete,
      updated_at = now()
    WHERE school_id = p_school_id
      AND lower(role) = lower(v_role)
      AND module_id = p_module_id;

    IF NOT FOUND THEN
      INSERT INTO public.role_permission_defaults (
        school_id, role, module_id, can_view, can_create, can_edit, can_delete
      ) VALUES (
        p_school_id, v_role, p_module_id, p_view, p_create, p_edit, p_delete
      );
    END IF;
  END IF;
END;
$$;

-- Seed global alinhado ao defaultForRole() do app (ações: ver/criar/editar/excluir)
DO $$
DECLARE
  r text;
  m text;
  all_modules text[] := ARRAY[
    'painelprincipal','escola','calendarioletivo','turmas','alunos','fichadoaluno',
    'frequencia','horariodeaula','agenda','ocorrencias','documentossecretaria','usuarios',
    'lotacao','topodosaber','boletins','conselho','controlelivros','relatorios',
    'meuperfil','permissoes','paineladmin'
  ];
  pedag text[] := ARRAY[
    'painelprincipal','turmas','alunos','fichadoaluno','frequencia','horariodeaula',
    'agenda','ocorrencias','boletins','conselho','topodosaber','controlelivros',
    'relatorios','meuperfil'
  ];
BEGIN
  -- Diretor / Administrador: tudo
  FOREACH r IN ARRAY ARRAY['Diretor', 'Administrador do Sistema'] LOOP
    FOREACH m IN ARRAY all_modules LOOP
      PERFORM public.upsert_role_default(r, m, true, true, true, true, NULL);
    END LOOP;
  END LOOP;

  -- Vice-diretor Administrativo
  r := 'Vice-diretor Administrativo';
  FOREACH m IN ARRAY all_modules LOOP
    PERFORM public.upsert_role_default(r, m, true, false, false, false, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY[
    'painelprincipal','escola','calendarioletivo','agenda','documentossecretaria',
    'usuarios','relatorios','meuperfil'
  ] LOOP
    PERFORM public.upsert_role_default(r, m, true, true, true, true, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY['alunos','turmas','ocorrencias'] LOOP
    PERFORM public.upsert_role_default(r, m, true, true, true, false, NULL);
  END LOOP;

  -- Vice-diretor Pedagógico / Coordenador
  FOREACH r IN ARRAY ARRAY['Vice-diretor Pedagógico', 'Coordenador'] LOOP
    FOREACH m IN ARRAY all_modules LOOP
      PERFORM public.upsert_role_default(r, m, true, false, false, false, NULL);
    END LOOP;
    FOREACH m IN ARRAY pedag LOOP
      PERFORM public.upsert_role_default(r, m, true, true, true, true, NULL);
    END LOOP;
    FOREACH m IN ARRAY ARRAY['relatorios','meuperfil'] LOOP
      PERFORM public.upsert_role_default(r, m, true, true, true, false, NULL);
    END LOOP;
  END LOOP;

  -- Secretario(a) Escolar
  r := 'Secretario(a) Escolar';
  FOREACH m IN ARRAY all_modules LOOP
    PERFORM public.upsert_role_default(r, m, true, false, false, false, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY[
    'painelprincipal','alunos','fichadoaluno','documentossecretaria','agenda',
    'calendarioletivo','escola','meuperfil'
  ] LOOP
    PERFORM public.upsert_role_default(r, m, true, true, true, true, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY['turmas','frequencia','ocorrencias','relatorios'] LOOP
    PERFORM public.upsert_role_default(r, m, true, true, true, false, NULL);
  END LOOP;

  -- Professor(a)
  r := 'Professor(a)';
  FOREACH m IN ARRAY all_modules LOOP
    PERFORM public.upsert_role_default(r, m, false, false, false, false, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY[
    'painelprincipal','turmas','alunos','fichadoaluno','frequencia','horariodeaula',
    'agenda','ocorrencias','boletins','conselho','topodosaber','controlelivros','meuperfil'
  ] LOOP
    PERFORM public.upsert_role_default(r, m, true, false, false, false, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY['frequencia','boletins','ocorrencias','agenda','meuperfil'] LOOP
    PERFORM public.upsert_role_default(r, m, true, true, true, false, NULL);
  END LOOP;
  PERFORM public.upsert_role_default(r, 'controlelivros', true, true, true, false, NULL);

  -- Fallback genérico "servidor"
  r := 'servidor';
  FOREACH m IN ARRAY all_modules LOOP
    PERFORM public.upsert_role_default(r, m, true, false, false, false, NULL);
  END LOOP;
  FOREACH m IN ARRAY ARRAY['painelprincipal','meuperfil'] LOOP
    PERFORM public.upsert_role_default(r, m, true, false, true, false, NULL);
  END LOOP;
END;
$$;

-- =========================================================
-- 3) Permissões por colaborador  →  public.staff_permissions
-- =========================================================
-- Equivalente a siga_user_permissions[userId][moduleId] = {ver,criar,editar,excluir}

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.school_staff(id) ON DELETE CASCADE,
  module_id text NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'custom',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_permissions_source_chk CHECK (
    source = ANY (ARRAY['custom'::text, 'role_default'::text, 'imported'::text])
  ),
  CONSTRAINT staff_permissions_school_staff_module_unique UNIQUE (school_id, staff_id, module_id)
);

COMMENT ON TABLE public.staff_permissions IS 'Permissões efetivas por colaborador (tela Permissões)';
COMMENT ON COLUMN public.staff_permissions.source IS 'custom | role_default | imported';
COMMENT ON COLUMN public.staff_permissions.can_view IS 'ver';
COMMENT ON COLUMN public.staff_permissions.can_create IS 'criar';
COMMENT ON COLUMN public.staff_permissions.can_edit IS 'editar';
COMMENT ON COLUMN public.staff_permissions.can_delete IS 'excluir';

CREATE INDEX IF NOT EXISTS staff_permissions_school_idx
  ON public.staff_permissions (school_id);

CREATE INDEX IF NOT EXISTS staff_permissions_staff_idx
  ON public.staff_permissions (staff_id);

CREATE INDEX IF NOT EXISTS staff_permissions_module_idx
  ON public.staff_permissions (school_id, module_id);

DROP TRIGGER IF EXISTS trg_staff_permissions_updated ON public.staff_permissions;
CREATE TRIGGER trg_staff_permissions_updated
  BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_staff_permission_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.school_staff%ROWTYPE;
BEGIN
  SELECT * INTO st FROM public.school_staff WHERE id = NEW.staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador % não encontrado', NEW.staff_id;
  END IF;

  IF st.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'staff_id não pertence à school_id informada';
  END IF;

  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  NEW.source := COALESCE(NULLIF(btrim(NEW.source), ''), 'custom');

  -- Sem ver → demais ações false
  IF NEW.can_view IS NOT TRUE THEN
    NEW.can_create := false;
    NEW.can_edit := false;
    NEW.can_delete := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_permissions_sync ON public.staff_permissions;
CREATE TRIGGER trg_staff_permissions_sync
  BEFORE INSERT OR UPDATE ON public.staff_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_staff_permission_fields();

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_permissions_select ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_insert ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_update ON public.staff_permissions;
DROP POLICY IF EXISTS staff_permissions_delete ON public.staff_permissions;

CREATE POLICY staff_permissions_select ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY staff_permissions_insert ON public.staff_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY staff_permissions_update ON public.staff_permissions
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY staff_permissions_delete ON public.staff_permissions
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_permissions TO authenticated;

-- =========================================================
-- 4) Metadados de alteração (espelho siga_permissions_meta)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.permissions_meta (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);

COMMENT ON TABLE public.permissions_meta IS 'Última alteração das permissões por escola';

ALTER TABLE public.permissions_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_meta_select ON public.permissions_meta;
DROP POLICY IF EXISTS permissions_meta_write ON public.permissions_meta;

CREATE POLICY permissions_meta_select ON public.permissions_meta
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY permissions_meta_write ON public.permissions_meta
  FOR ALL TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.permissions_meta TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_permissions_meta(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.user_can_access_school(p_school_id) AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Sem acesso à escola';
  END IF;

  INSERT INTO public.permissions_meta (school_id, updated_at, updated_by)
  VALUES (p_school_id, now(), auth.uid())
  ON CONFLICT (school_id) DO UPDATE
  SET updated_at = now(),
      updated_by = COALESCE(auth.uid(), public.permissions_meta.updated_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_permissions_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_role_default(text, text, boolean, boolean, boolean, boolean, uuid) TO authenticated;

-- Aplica padrão do cargo ao colaborador (útil ao criar usuário / resetar)
CREATE OR REPLACE FUNCTION public.apply_role_defaults_to_staff(p_staff_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.school_staff%ROWTYPE;
  inserted_count int := 0;
BEGIN
  SELECT * INTO st FROM public.school_staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador % não encontrado', p_staff_id;
  END IF;

  IF NOT public.user_can_access_school(st.school_id) AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Sem acesso à escola do colaborador';
  END IF;

  INSERT INTO public.staff_permissions (
    school_id, staff_id, module_id, can_view, can_create, can_edit, can_delete, source, updated_by
  )
  SELECT
    st.school_id,
    st.id,
    d.module_id,
    d.can_view,
    d.can_create,
    d.can_edit,
    d.can_delete,
    'role_default',
    auth.uid()
  FROM public.role_permission_defaults d
  WHERE lower(d.role) = lower(st.role)
    AND (
      d.school_id = st.school_id
      OR (
        d.school_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.role_permission_defaults x
          WHERE x.school_id = st.school_id
            AND lower(x.role) = lower(st.role)
            AND x.module_id = d.module_id
        )
      )
    )
  ON CONFLICT (school_id, staff_id, module_id) DO UPDATE
  SET
    can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete,
    source = 'role_default',
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  PERFORM public.touch_permissions_meta(st.school_id);
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_role_defaults_to_staff(uuid) TO authenticated;

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT id, label, group_name FROM public.permission_modules ORDER BY sort_order;
-- SELECT role, count(*) FROM public.role_permission_defaults WHERE school_id IS NULL GROUP BY role;
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('permission_modules','role_permission_defaults','staff_permissions','permissions_meta');
