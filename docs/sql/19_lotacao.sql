-- SIGA EDUCA — Gestão de Lotação
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, user_can_access_school(), set_updated_at()
-- App hoje: Gestão de Lotação/ (localStorage lotacao_data + professores_cadastro)
--
-- Modelo SEPARADO (pedido explícito):
--   1) public.lotacao_professores  → cadastro/dados do professor (ficha / cadastro)
--   2) public.lotacao_alocacoes    → mapa de lotação (turma × disciplina × CH)
--
-- A alocação referencia o professor por FK (nullable = vaga sem professor).

-- =========================================================
-- 1) Professores da lotação  →  public.lotacao_professores
-- Espelha localStorage: professores_cadastro
--   { nome, matricula, dv, cargo, vinculo, setor }
-- =========================================================

CREATE TABLE IF NOT EXISTS public.lotacao_professores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- vínculo opcional com Usuários (school_staff), se o professor também tiver login
  staff_id uuid REFERENCES public.school_staff(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  matricula text NOT NULL,
  matricula_dv text,
  cargo text NOT NULL DEFAULT 'PROFESSOR',
  vinculo text NOT NULL DEFAULT 'EFETIVO',
  setor text,
  -- carga horária contratual / de referência (quando informada no mapa)
  ch_referencia integer,
  phone text,
  email text,
  notes text,
  status text NOT NULL DEFAULT 'Ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lotacao_professores_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT lotacao_professores_matricula_not_blank CHECK (length(btrim(matricula)) > 0),
  CONSTRAINT lotacao_professores_cargo_chk CHECK (
    upper(btrim(cargo)) = ANY (ARRAY['PROFESSOR'::text, 'PROFESSORA'::text])
  ),
  CONSTRAINT lotacao_professores_vinculo_chk CHECK (
    upper(btrim(vinculo)) = ANY (ARRAY['EFETIVO'::text, 'TEMPORÁRIO'::text, 'TEMPORARIO'::text])
  ),
  CONSTRAINT lotacao_professores_status_chk CHECK (
    status = ANY (ARRAY['Ativo'::text, 'Inativo'::text])
  ),
  CONSTRAINT lotacao_professores_ch_chk CHECK (
    ch_referencia IS NULL OR (ch_referencia >= 0 AND ch_referencia <= 80)
  ),
  CONSTRAINT lotacao_professores_school_matricula_unique UNIQUE (school_id, matricula)
);

COMMENT ON TABLE public.lotacao_professores IS
  'Cadastro de professores da Gestão de Lotação (separado das alocações e de school_staff)';
COMMENT ON COLUMN public.lotacao_professores.matricula IS 'Número da matrícula SEDUC sem dígito verificador';
COMMENT ON COLUMN public.lotacao_professores.matricula_dv IS 'Dígito verificador da matrícula (ex.: 1, 2)';
COMMENT ON COLUMN public.lotacao_professores.cargo IS 'PROFESSOR ou PROFESSORA';
COMMENT ON COLUMN public.lotacao_professores.vinculo IS 'EFETIVO ou TEMPORÁRIO';
COMMENT ON COLUMN public.lotacao_professores.setor IS 'Setor / lotação administrativa (ficha)';
COMMENT ON COLUMN public.lotacao_professores.staff_id IS
  'Opcional: liga ao colaborador em Usuários (school_staff), sem misturar os cadastros';

CREATE INDEX IF NOT EXISTS lotacao_professores_school_idx
  ON public.lotacao_professores (school_id);

CREATE INDEX IF NOT EXISTS lotacao_professores_name_idx
  ON public.lotacao_professores (school_id, lower(full_name));

CREATE INDEX IF NOT EXISTS lotacao_professores_matricula_idx
  ON public.lotacao_professores (school_id, matricula);

CREATE INDEX IF NOT EXISTS lotacao_professores_status_idx
  ON public.lotacao_professores (school_id, status);

CREATE INDEX IF NOT EXISTS lotacao_professores_staff_idx
  ON public.lotacao_professores (staff_id);

DROP TRIGGER IF EXISTS trg_lotacao_professores_updated ON public.lotacao_professores;
CREATE TRIGGER trg_lotacao_professores_updated
  BEFORE UPDATE ON public.lotacao_professores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_lotacao_professor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.full_name := upper(btrim(NEW.full_name));
  NEW.matricula := regexp_replace(btrim(NEW.matricula), '\D', '', 'g');
  NEW.matricula_dv := NULLIF(btrim(COALESCE(NEW.matricula_dv, '')), '');
  NEW.cargo := upper(btrim(NEW.cargo));
  NEW.vinculo := upper(btrim(NEW.vinculo));
  IF NEW.vinculo = 'TEMPORARIO' THEN
    NEW.vinculo := 'TEMPORÁRIO';
  END IF;
  NEW.setor := NULLIF(btrim(COALESCE(NEW.setor, '')), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotacao_professores_normalize ON public.lotacao_professores;
CREATE TRIGGER trg_lotacao_professores_normalize
  BEFORE INSERT OR UPDATE ON public.lotacao_professores
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_lotacao_professor();

ALTER TABLE public.lotacao_professores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lotacao_professores_select ON public.lotacao_professores;
DROP POLICY IF EXISTS lotacao_professores_insert ON public.lotacao_professores;
DROP POLICY IF EXISTS lotacao_professores_update ON public.lotacao_professores;
DROP POLICY IF EXISTS lotacao_professores_delete ON public.lotacao_professores;

CREATE POLICY lotacao_professores_select ON public.lotacao_professores
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY lotacao_professores_insert ON public.lotacao_professores
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY lotacao_professores_update ON public.lotacao_professores
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY lotacao_professores_delete ON public.lotacao_professores
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lotacao_professores TO authenticated;

-- =========================================================
-- 2) Alocações (mapa de lotação)  →  public.lotacao_alocacoes
-- Espelha localStorage: lotacao_data
--   { ano, oferta, modal, turno, turma, num_alunos,
--     disciplina, ch_disciplina, professor, matricula,
--     ch_professor, codigo }
-- =========================================================

CREATE TABLE IF NOT EXISTS public.lotacao_alocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year_number integer NOT NULL DEFAULT 2026,
  oferta integer,
  modalidade text NOT NULL DEFAULT 'REG',
  turno text NOT NULL,
  turma_code text NOT NULL,
  num_alunos integer,
  disciplina text NOT NULL,
  disciplina_codigo text,
  ch_disciplina numeric(6,2),
  -- FK para cadastro separado de professores (NULL = vaga / sem professor)
  professor_id uuid REFERENCES public.lotacao_professores(id) ON DELETE SET NULL,
  -- snapshots opcionais (úteis em export/impressão mesmo se o cadastro mudar)
  professor_nome text,
  professor_matricula text,
  ch_professor numeric(6,2),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lotacao_alocacoes_turma_not_blank CHECK (length(btrim(turma_code)) > 0),
  CONSTRAINT lotacao_alocacoes_disciplina_not_blank CHECK (length(btrim(disciplina)) > 0),
  CONSTRAINT lotacao_alocacoes_turno_not_blank CHECK (length(btrim(turno)) > 0),
  CONSTRAINT lotacao_alocacoes_year_chk CHECK (year_number >= 2000 AND year_number <= 2100),
  CONSTRAINT lotacao_alocacoes_num_alunos_chk CHECK (
    num_alunos IS NULL OR (num_alunos >= 0 AND num_alunos <= 200)
  ),
  CONSTRAINT lotacao_alocacoes_ch_disc_chk CHECK (
    ch_disciplina IS NULL OR (ch_disciplina >= 0 AND ch_disciplina <= 80)
  ),
  CONSTRAINT lotacao_alocacoes_ch_prof_chk CHECK (
    ch_professor IS NULL OR (ch_professor >= 0 AND ch_professor <= 80)
  )
);

COMMENT ON TABLE public.lotacao_alocacoes IS
  'Mapa de lotação: turma × disciplina × carga horária (professor via lotacao_professores)';
COMMENT ON COLUMN public.lotacao_alocacoes.oferta IS 'Código de oferta SEDUC (quando houver)';
COMMENT ON COLUMN public.lotacao_alocacoes.modalidade IS 'Ex.: REG, AEE, EJA, FLUXO';
COMMENT ON COLUMN public.lotacao_alocacoes.disciplina_codigo IS 'Código da disciplina no mapa (campo codigo do app)';
COMMENT ON COLUMN public.lotacao_alocacoes.professor_id IS
  'FK para lotacao_professores; NULL quando a linha está vaga (sem professor)';
COMMENT ON COLUMN public.lotacao_alocacoes.professor_nome IS
  'Nome espelhado da linha (compatível com o app atual; preferir professor_id)';
COMMENT ON COLUMN public.lotacao_alocacoes.professor_matricula IS
  'Matrícula completa espelhada (ex.: 5973373-2); preferir professor_id';

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_school_idx
  ON public.lotacao_alocacoes (school_id);

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_year_idx
  ON public.lotacao_alocacoes (school_id, year_number);

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_turma_idx
  ON public.lotacao_alocacoes (school_id, year_number, upper(turma_code));

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_disciplina_idx
  ON public.lotacao_alocacoes (school_id, year_number, lower(disciplina));

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_professor_idx
  ON public.lotacao_alocacoes (professor_id);

CREATE INDEX IF NOT EXISTS lotacao_alocacoes_modal_turno_idx
  ON public.lotacao_alocacoes (school_id, year_number, upper(modalidade), upper(turno));

DROP TRIGGER IF EXISTS trg_lotacao_alocacoes_updated ON public.lotacao_alocacoes;
CREATE TRIGGER trg_lotacao_alocacoes_updated
  BEFORE UPDATE ON public.lotacao_alocacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_lotacao_alocacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.lotacao_professores%ROWTYPE;
BEGIN
  NEW.turma_code := upper(btrim(NEW.turma_code));
  NEW.disciplina := upper(btrim(NEW.disciplina));
  NEW.modalidade := upper(btrim(COALESCE(NEW.modalidade, 'REG')));
  NEW.turno := upper(btrim(NEW.turno));
  NEW.disciplina_codigo := NULLIF(btrim(COALESCE(NEW.disciplina_codigo, '')), '');
  NEW.professor_nome := NULLIF(upper(btrim(COALESCE(NEW.professor_nome, ''))), '');
  NEW.professor_matricula := NULLIF(btrim(COALESCE(NEW.professor_matricula, '')), '');
  IF NEW.professor_nome IN ('-', '—') THEN
    NEW.professor_nome := NULL;
  END IF;
  IF NEW.professor_matricula IN ('-', '—') THEN
    NEW.professor_matricula := NULL;
  END IF;

  -- Se tem professor_id, completa snapshots a partir do cadastro separado
  IF NEW.professor_id IS NOT NULL THEN
    SELECT * INTO p FROM public.lotacao_professores WHERE id = NEW.professor_id;
    IF FOUND THEN
      IF p.school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Professor pertence a outra escola';
      END IF;
      NEW.professor_nome := COALESCE(NEW.professor_nome, p.full_name);
      NEW.professor_matricula := COALESCE(
        NEW.professor_matricula,
        CASE
          WHEN p.matricula_dv IS NOT NULL AND p.matricula_dv <> '' THEN p.matricula || '-' || p.matricula_dv
          ELSE p.matricula
        END
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotacao_alocacoes_normalize ON public.lotacao_alocacoes;
CREATE TRIGGER trg_lotacao_alocacoes_normalize
  BEFORE INSERT OR UPDATE ON public.lotacao_alocacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_lotacao_alocacao();

ALTER TABLE public.lotacao_alocacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lotacao_alocacoes_select ON public.lotacao_alocacoes;
DROP POLICY IF EXISTS lotacao_alocacoes_insert ON public.lotacao_alocacoes;
DROP POLICY IF EXISTS lotacao_alocacoes_update ON public.lotacao_alocacoes;
DROP POLICY IF EXISTS lotacao_alocacoes_delete ON public.lotacao_alocacoes;

CREATE POLICY lotacao_alocacoes_select ON public.lotacao_alocacoes
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY lotacao_alocacoes_insert ON public.lotacao_alocacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY lotacao_alocacoes_update ON public.lotacao_alocacoes
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY lotacao_alocacoes_delete ON public.lotacao_alocacoes
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lotacao_alocacoes TO authenticated;

-- =========================================================
-- 3) View útil: mapa com dados do professor
-- =========================================================

CREATE OR REPLACE VIEW public.v_lotacao_mapa
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.school_id,
  a.year_number,
  a.oferta,
  a.modalidade,
  a.turno,
  a.turma_code,
  a.num_alunos,
  a.disciplina,
  a.disciplina_codigo,
  a.ch_disciplina,
  a.professor_id,
  COALESCE(a.professor_nome, p.full_name) AS professor_nome,
  COALESCE(
    a.professor_matricula,
    CASE
      WHEN p.matricula IS NULL THEN NULL
      WHEN p.matricula_dv IS NOT NULL AND p.matricula_dv <> '' THEN p.matricula || '-' || p.matricula_dv
      ELSE p.matricula
    END
  ) AS professor_matricula,
  p.cargo AS professor_cargo,
  p.vinculo AS professor_vinculo,
  p.setor AS professor_setor,
  a.ch_professor,
  CASE WHEN a.professor_id IS NULL AND a.professor_nome IS NULL THEN 'vago' ELSE 'lotado' END AS status_lotacao,
  a.sort_order,
  a.created_at,
  a.updated_at
FROM public.lotacao_alocacoes a
LEFT JOIN public.lotacao_professores p ON p.id = a.professor_id;

COMMENT ON VIEW public.v_lotacao_mapa IS
  'Mapa de lotação com dados do professor (cadastro separado)';

GRANT SELECT ON public.v_lotacao_mapa TO authenticated;

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('lotacao_professores','lotacao_alocacoes');
--
-- Exemplo de cadastro de professor:
-- INSERT INTO public.lotacao_professores (
--   school_id, full_name, matricula, matricula_dv, cargo, vinculo
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'CLEUSIONE CALACIO SANTANA',
--   '5973373',
--   '2',
--   'PROFESSORA',
--   'EFETIVO'
-- );
--
-- Exemplo de alocação (com professor):
-- INSERT INTO public.lotacao_alocacoes (
--   school_id, year_number, oferta, modalidade, turno, turma_code,
--   num_alunos, disciplina, disciplina_codigo, ch_disciplina, professor_id, ch_professor
-- ) VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   2026, 553596, 'AEE', 'MANHA', 'EEMAE01',
--   9, 'EDUCACAO ESPECIAL', '1003', 20,
--   'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy', 40
-- );
