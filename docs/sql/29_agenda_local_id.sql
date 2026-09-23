-- Identificador local da agenda, para a tela gravar e ler o mesmo evento no banco.

ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS local_id text;

CREATE UNIQUE INDEX IF NOT EXISTS agenda_events_school_local_idx
  ON public.agenda_events (school_id, local_id);
