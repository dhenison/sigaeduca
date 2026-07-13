-- SIGA EDUCA — Menu 2: Calendário Letivo
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisito: Menu 1 (schools + academic_years + user_can_access_school)

-- =========================================================
-- Tabela: um registro por dia / por escola
-- Espelha o mapa localStorage siga_calendar_days:
--   { "2026-05-01": { type: "letivo", label: "Dia Letivo" }, ... }
-- =========================================================

CREATE TABLE IF NOT EXISTS public.calendar_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  day_date date NOT NULL,
  day_type text NOT NULL DEFAULT 'letivo',
  label text NOT NULL DEFAULT 'Dia Letivo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_days_school_date_unique UNIQUE (school_id, day_date),
  CONSTRAINT calendar_days_type_chk CHECK (
    day_type = ANY (ARRAY[
      'letivo',
      'feriado_recesso',
      'evento',
      'sabado',
      'sabado_letivo',
      'sabado_nao_letivo',
      'domingo',
      'inicio_bimestre',
      'inicio_trimestre',
      'inicio_semestre',
      'fim_bimestre',
      'fim_ano'
    ])
    OR day_type LIKE 'inicio_%'
    OR day_type LIKE 'fim_%'
  ),
  CONSTRAINT calendar_days_label_not_blank CHECK (length(btrim(label)) > 0)
);

COMMENT ON TABLE public.calendar_days IS 'Calendário letivo por escola (dias letivos, feriados, recessos)';
COMMENT ON COLUMN public.calendar_days.day_type IS 'Tipos usados na UI: letivo, feriado_recesso, domingo, sabado_nao_letivo, evento, sabado, inicio_*';
COMMENT ON COLUMN public.calendar_days.academic_year_id IS 'Ano letivo opcional; se nulo, a UI pode inferir pelo year de day_date';

CREATE INDEX IF NOT EXISTS calendar_days_school_idx
  ON public.calendar_days (school_id);

CREATE INDEX IF NOT EXISTS calendar_days_school_date_idx
  ON public.calendar_days (school_id, day_date);

CREATE INDEX IF NOT EXISTS calendar_days_type_idx
  ON public.calendar_days (school_id, day_type);

CREATE INDEX IF NOT EXISTS calendar_days_year_idx
  ON public.calendar_days (academic_year_id);

-- updated_at automático
DROP TRIGGER IF EXISTS trg_calendar_days_updated ON public.calendar_days;
CREATE TRIGGER trg_calendar_days_updated
  BEFORE UPDATE ON public.calendar_days
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- RLS multi-tenant
-- =========================================================
ALTER TABLE public.calendar_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_days_select ON public.calendar_days;
DROP POLICY IF EXISTS calendar_days_insert ON public.calendar_days;
DROP POLICY IF EXISTS calendar_days_update ON public.calendar_days;
DROP POLICY IF EXISTS calendar_days_delete ON public.calendar_days;

CREATE POLICY calendar_days_select ON public.calendar_days
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY calendar_days_insert ON public.calendar_days
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY calendar_days_update ON public.calendar_days
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY calendar_days_delete ON public.calendar_days
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_days TO authenticated;

-- =========================================================
-- Seed opcional: maio/2026 (úteis) + julho/2026 (férias)
-- para as escolas que ainda não têm dias nesses meses
-- =========================================================

-- Maio 2026
INSERT INTO public.calendar_days (school_id, academic_year_id, day_date, day_type, label)
SELECT
  s.id,
  ay.id,
  d::date,
  CASE EXTRACT(DOW FROM d::date)::int
    WHEN 0 THEN 'domingo'
    WHEN 6 THEN 'sabado_nao_letivo'
    ELSE 'letivo'
  END,
  CASE EXTRACT(DOW FROM d::date)::int
    WHEN 0 THEN 'Domingo (Não Letivo)'
    WHEN 6 THEN 'Sábado (Não Letivo)'
    ELSE 'Dia Letivo'
  END
FROM public.schools s
LEFT JOIN public.academic_years ay
  ON ay.school_id = s.id AND ay.year_number = 2026 AND ay.is_current = true
CROSS JOIN generate_series(DATE '2026-05-01', DATE '2026-05-31', INTERVAL '1 day') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_days cd
  WHERE cd.school_id = s.id AND cd.day_date = d::date
);

-- Julho 2026 (férias / recesso)
INSERT INTO public.calendar_days (school_id, academic_year_id, day_date, day_type, label)
SELECT
  s.id,
  ay.id,
  d::date,
  CASE EXTRACT(DOW FROM d::date)::int
    WHEN 0 THEN 'domingo'
    WHEN 6 THEN 'sabado_nao_letivo'
    ELSE 'feriado_recesso'
  END,
  CASE EXTRACT(DOW FROM d::date)::int
    WHEN 0 THEN 'Domingo (Férias Escolares)'
    WHEN 6 THEN 'Sábado (Férias Escolares)'
    ELSE 'Férias Escolares'
  END
FROM public.schools s
LEFT JOIN public.academic_years ay
  ON ay.school_id = s.id AND ay.year_number = 2026 AND ay.is_current = true
CROSS JOIN generate_series(DATE '2026-07-01', DATE '2026-07-31', INTERVAL '1 day') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_days cd
  WHERE cd.school_id = s.id AND cd.day_date = d::date
);

-- =========================================================
-- Conferência
-- =========================================================
-- SELECT s.nome, COUNT(*) AS dias, COUNT(*) FILTER (WHERE cd.day_type = 'letivo') AS letivos
-- FROM public.calendar_days cd
-- JOIN public.schools s ON s.id = cd.school_id
-- GROUP BY s.nome
-- ORDER BY s.nome;
