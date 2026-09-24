-- Agenda EGAP no aplicativo: aluno (anon) e professor leem o mesmo calendário e a mesma agenda da web.
CREATE OR REPLACE FUNCTION public.portal_school_agenda(p_school_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT jsonb_build_object(
    'days', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', day_date,
        'type', day_type,
        'label', label
      ) ORDER BY day_date)
      FROM public.calendar_days
      WHERE school_id = p_school_id
        AND day_type NOT IN ('letivo', 'domingo', 'sabado_nao_letivo')
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'title', title,
        'date', event_date,
        'type', event_type,
        'description', COALESCE(description, ''),
        'scope', COALESCE(scope, 'geral'),
        'classes', to_jsonb(COALESCE(class_codes, '{}'::text[]))
      ) ORDER BY event_date)
      FROM public.agenda_events
      WHERE school_id = p_school_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.portal_school_agenda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_school_agenda(uuid) TO anon, authenticated;
