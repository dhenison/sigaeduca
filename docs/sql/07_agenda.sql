-- SIGA EDUCA — Menu 7: Agenda
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, classes (opcional para vínculo), user_can_access_school()
-- App hoje: localStorage siga_agenda_events
--   { id, title, type, date, desc, scope: 'geral'|'turmas', turmas: ['CODE', ...] }

-- =========================================================
-- Eventos da agenda  →  public.agenda_events
-- =========================================================

CREATE TABLE IF NOT EXISTS public.agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'Provas & Testes',
  event_date date NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'geral',
  class_codes text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_events_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT agenda_events_scope_chk CHECK (scope = ANY (ARRAY['geral'::text, 'turmas'::text])),
  CONSTRAINT agenda_events_type_chk CHECK (
    event_type = ANY (ARRAY[
      'Provas & Testes'::text,
      'Entrega de Trabalho'::text,
      'Reunião de Pais'::text,
      'Evento Escolar'::text,
      'Feriado / Recesso'::text
    ])
  ),
  CONSTRAINT agenda_events_turmas_scope_chk CHECK (
    (scope = 'geral' AND coalesce(array_length(class_codes, 1), 0) = 0)
    OR
    (scope = 'turmas' AND coalesce(array_length(class_codes, 1), 0) >= 1)
  )
);

COMMENT ON TABLE public.agenda_events IS 'Agenda escolar por unidade (geral ou por turmas)';
COMMENT ON COLUMN public.agenda_events.event_type IS 'Tipo: Provas & Testes, Entrega de Trabalho, Reunião de Pais, Evento Escolar, Feriado / Recesso';
COMMENT ON COLUMN public.agenda_events.scope IS 'geral = todas as turmas; turmas = lista em class_codes';
COMMENT ON COLUMN public.agenda_events.class_codes IS 'Códigos das turmas (quando scope = turmas)';

CREATE INDEX IF NOT EXISTS agenda_events_school_idx
  ON public.agenda_events (school_id);

CREATE INDEX IF NOT EXISTS agenda_events_school_date_idx
  ON public.agenda_events (school_id, event_date);

CREATE INDEX IF NOT EXISTS agenda_events_type_idx
  ON public.agenda_events (school_id, event_type);

CREATE INDEX IF NOT EXISTS agenda_events_scope_idx
  ON public.agenda_events (school_id, scope);

-- GIN para filtrar por código de turma no array
CREATE INDEX IF NOT EXISTS agenda_events_class_codes_gin
  ON public.agenda_events USING gin (class_codes);

DROP TRIGGER IF EXISTS trg_agenda_events_updated ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_updated
  BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Normaliza título/códigos e preenche auditoria
CREATE OR REPLACE FUNCTION public.sync_agenda_event_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  NEW.class_codes := COALESCE(NEW.class_codes, '{}'::text[]);

  IF NEW.scope = 'geral' THEN
    NEW.class_codes := '{}'::text[];
  ELSE
    -- remove vazios / duplicados
    SELECT coalesce(array_agg(DISTINCT btrim(x)), '{}'::text[])
    INTO NEW.class_codes
    FROM unnest(NEW.class_codes) AS x
    WHERE btrim(x) <> '';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_events_sync ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_sync
  BEFORE INSERT OR UPDATE ON public.agenda_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_agenda_event_fields();

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_events_select ON public.agenda_events;
DROP POLICY IF EXISTS agenda_events_insert ON public.agenda_events;
DROP POLICY IF EXISTS agenda_events_update ON public.agenda_events;
DROP POLICY IF EXISTS agenda_events_delete ON public.agenda_events;

CREATE POLICY agenda_events_select ON public.agenda_events
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY agenda_events_insert ON public.agenda_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY agenda_events_update ON public.agenda_events
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY agenda_events_delete ON public.agenda_events
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agenda_events TO authenticated;

-- =========================================================
-- Vínculo opcional evento ↔ turma (UUID), além dos códigos
-- Útil para joins com public.classes; class_codes continua
-- sendo a fonte usada pela UI atual.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.agenda_event_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_event_classes_unique UNIQUE (event_id, class_id)
);

COMMENT ON TABLE public.agenda_event_classes IS 'Vínculo opcional agenda_events ↔ classes (por UUID)';

CREATE INDEX IF NOT EXISTS agenda_event_classes_event_idx
  ON public.agenda_event_classes (event_id);

CREATE INDEX IF NOT EXISTS agenda_event_classes_class_idx
  ON public.agenda_event_classes (class_id);

CREATE INDEX IF NOT EXISTS agenda_event_classes_school_idx
  ON public.agenda_event_classes (school_id);

CREATE OR REPLACE FUNCTION public.sync_agenda_event_class_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ev_school uuid;
  cl_school uuid;
BEGIN
  SELECT school_id INTO ev_school FROM public.agenda_events WHERE id = NEW.event_id;
  SELECT school_id INTO cl_school FROM public.classes WHERE id = NEW.class_id;
  IF ev_school IS NULL THEN
    RAISE EXCEPTION 'Evento % não encontrado', NEW.event_id;
  END IF;
  IF cl_school IS NULL THEN
    RAISE EXCEPTION 'Turma % não encontrada', NEW.class_id;
  END IF;
  IF ev_school <> cl_school THEN
    RAISE EXCEPTION 'Evento e turma pertencem a escolas diferentes';
  END IF;
  NEW.school_id := ev_school;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_event_classes_sync ON public.agenda_event_classes;
CREATE TRIGGER trg_agenda_event_classes_sync
  BEFORE INSERT OR UPDATE ON public.agenda_event_classes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_agenda_event_class_school();

ALTER TABLE public.agenda_event_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_event_classes_select ON public.agenda_event_classes;
DROP POLICY IF EXISTS agenda_event_classes_insert ON public.agenda_event_classes;
DROP POLICY IF EXISTS agenda_event_classes_update ON public.agenda_event_classes;
DROP POLICY IF EXISTS agenda_event_classes_delete ON public.agenda_event_classes;

CREATE POLICY agenda_event_classes_select ON public.agenda_event_classes
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY agenda_event_classes_insert ON public.agenda_event_classes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY agenda_event_classes_update ON public.agenda_event_classes
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY agenda_event_classes_delete ON public.agenda_event_classes
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agenda_event_classes TO authenticated;

-- =========================================================
-- Exemplos (opcional)
-- =========================================================
-- -- Agenda geral
-- INSERT INTO public.agenda_events (school_id, title, event_type, event_date, description, scope)
-- VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'Conselho de Classe — 1º Bimestre',
--   'Evento Escolar',
--   DATE '2026-04-15',
--   'Reunião com coordenação',
--   'geral'
-- );
--
-- -- Por turmas
-- INSERT INTO public.agenda_events (school_id, title, event_type, event_date, scope, class_codes)
-- VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
--   'Prova de Matemática',
--   'Provas & Testes',
--   DATE '2026-05-20',
--   'turmas',
--   ARRAY['M1MNM01', 'M1MNT01']
-- );

-- Conferência:
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('agenda_events', 'agenda_event_classes');
--
-- -- Eventos gerais + de uma turma específica (como na UI):
-- -- SELECT * FROM public.agenda_events
-- -- WHERE school_id = '...'
-- --   AND (
-- --     scope = 'geral'
-- --     OR 'M1MNM01' = ANY (class_codes)
-- --   )
-- -- ORDER BY event_date;
