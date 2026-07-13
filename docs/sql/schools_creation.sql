-- SIGA EDUCA — banco de criação de escolas (Painel Admin)
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Fonte da verdade: public.schools
--
-- Fluxo:
--   login admin → paineladmin.html → Nova Escola → INSERT public.schools
--   Acessar Painel → profiles.school_id + localStorage → painelprincipal.html

-- Núcleo (já aplicado em schools_multi_tenant_core + schools_creation_hardening)
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  inep text NOT NULL,
  endereco text,
  email text,
  telefone text,
  diretor_nome text,
  diretor_contato text,
  diretor_email text,
  logo_url text,
  status text NOT NULL DEFAULT 'Ativa'
    CHECK (status = ANY (ARRAY['Ativa'::text, 'Inativa'::text])),
  menu_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schools_inep_unique UNIQUE (inep),
  CONSTRAINT schools_inep_len_chk CHECK (char_length(btrim(inep)) BETWEEN 8 AND 12),
  CONSTRAINT schools_nome_not_blank CHECK (length(btrim(nome)) > 0)
);

CREATE INDEX IF NOT EXISTS schools_nome_idx ON public.schools (lower(nome));
CREATE INDEX IF NOT EXISTS schools_status_idx ON public.schools (status);

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
  );
$$;

CREATE OR REPLACE FUNCTION public.set_schools_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.inep := regexp_replace(COALESCE(NEW.inep, ''), '\D', '', 'g');
  NEW.nome := btrim(NEW.nome);

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schools_audit ON public.schools;
CREATE TRIGGER trg_schools_audit
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_schools_audit();

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Políticas (idempotente: dropar e recriar)
DROP POLICY IF EXISTS schools_select_admin_or_member ON public.schools;
DROP POLICY IF EXISTS schools_insert_admin ON public.schools;
DROP POLICY IF EXISTS schools_update_admin ON public.schools;
DROP POLICY IF EXISTS schools_delete_admin ON public.schools;

CREATE POLICY schools_select_admin_or_member ON public.schools
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1 FROM public.school_memberships m
      WHERE m.school_id = schools.id
        AND m.user_id = auth.uid()
        AND m.is_active = true
    )
  );

CREATE POLICY schools_insert_admin ON public.schools
  FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY schools_update_admin ON public.schools
  FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY schools_delete_admin ON public.schools
  FOR DELETE TO authenticated
  USING (public.is_system_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schools TO authenticated;

-- Exemplo de insert (somente com JWT do admin do sistema)
-- INSERT INTO public.schools (
--   nome, inep, endereco, email, telefone,
--   diretor_nome, diretor_contato, diretor_email, status, menu_permissions
-- ) VALUES (
--   'Escola Exemplo',
--   '12345678',
--   'Rua Exemplo, 100',
--   'contato@escola.seduc.pa.gov.br',
--   '(91) 99999-0000',
--   'Nome do Diretor',
--   '(91) 98888-0000',
--   'diretor@escola.seduc.pa.gov.br',
--   'Ativa',
--   '{}'::jsonb
-- );
