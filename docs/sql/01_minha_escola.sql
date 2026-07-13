-- SIGA EDUCA — Menu 1: Minha Escola
-- Projeto: digjzihjboflcuftmokj
-- Já aplicado no Supabase como migration: menu_01_minha_escola

-- Campos de perfil da unidade (escola.html / contexto do painel)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS uf text;

ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_uf_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_uf_chk
  CHECK (uf IS NULL OR char_length(btrim(uf)) = 2);

-- Acesso multi-tenant
CREATE OR REPLACE FUNCTION public.user_can_access_school(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_school_id IS NOT NULL
    AND (
      public.is_system_admin()
      OR EXISTS (
        SELECT 1
        FROM public.school_memberships m
        WHERE m.school_id = p_school_id
          AND m.user_id = auth.uid()
          AND m.is_active = true
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_school(uuid) TO authenticated;

-- Gestores da escola podem atualizar dados da própria unidade
DROP POLICY IF EXISTS schools_update_member ON public.schools;
CREATE POLICY schools_update_member ON public.schools
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships m
      WHERE m.school_id = schools.id
        AND m.user_id = auth.uid()
        AND m.is_active = true
        AND lower(m.role) = ANY (ARRAY['diretor','admin_escola','secretario','secretaria','gestor'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.school_memberships m
      WHERE m.school_id = schools.id
        AND m.user_id = auth.uid()
        AND m.is_active = true
        AND lower(m.role) = ANY (ARRAY['diretor','admin_escola','secretario','secretaria','gestor'])
    )
  );

-- Ano letivo (base do Calendário / Turmas)
CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL,
  year_number integer NOT NULL,
  starts_on date,
  ends_on date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_school_year_unique UNIQUE (school_id, year_number),
  CONSTRAINT academic_years_label_not_blank CHECK (length(btrim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS academic_years_school_idx ON public.academic_years (school_id);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
DROP POLICY IF EXISTS academic_years_write ON public.academic_years;

CREATE POLICY academic_years_select ON public.academic_years
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY academic_years_write ON public.academic_years
  FOR ALL TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.academic_years TO authenticated;

-- Conferência
-- SELECT s.nome, ay.label, ay.is_current
-- FROM public.schools s
-- LEFT JOIN public.academic_years ay ON ay.school_id = s.id
-- ORDER BY s.nome;
