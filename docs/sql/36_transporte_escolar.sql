-- Cadastro de transporte escolar preenchido pelo aluno e consultado pela escola.
CREATE TABLE IF NOT EXISTS public.student_transport_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  class_code text,
  shift text,
  uses_transport boolean NOT NULL,
  responsible_name text,
  address text,
  neighborhood text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_transport_student_unique UNIQUE (student_id),
  CONSTRAINT student_transport_details_chk CHECK (
    uses_transport = false
    OR (
      length(btrim(coalesce(responsible_name, ''))) > 0
      AND length(btrim(coalesce(address, ''))) > 0
      AND length(btrim(coalesce(neighborhood, ''))) > 0
    )
  )
);

ALTER TABLE public.student_transport_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_transport_staff_select ON public.student_transport_registrations;
CREATE POLICY student_transport_staff_select ON public.student_transport_registrations
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

REVOKE ALL ON TABLE public.student_transport_registrations FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.student_transport_registrations TO authenticated;

CREATE OR REPLACE FUNCTION public.student_portal_transport(
  p_student_id uuid,
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r public.student_transport_registrations%ROWTYPE;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r
  FROM public.student_transport_registrations
  WHERE student_id = p_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('registered', false);
  END IF;

  RETURN jsonb_build_object(
    'registered', true,
    'uses_transport', r.uses_transport,
    'responsible_name', coalesce(r.responsible_name, ''),
    'address', coalesce(r.address, ''),
    'neighborhood', coalesce(r.neighborhood, ''),
    'updated_at', r.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_portal_save_transport(
  p_student_id uuid,
  p_token text,
  p_uses_transport boolean,
  p_responsible_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  st public.students%ROWTYPE;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RAISE EXCEPTION 'Sessão do aluno inválida ou expirada.';
  END IF;

  SELECT * INTO st FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado.';
  END IF;

  IF p_uses_transport AND (
    length(btrim(coalesce(p_responsible_name, ''))) = 0
    OR length(btrim(coalesce(p_address, ''))) = 0
    OR length(btrim(coalesce(p_neighborhood, ''))) = 0
  ) THEN
    RAISE EXCEPTION 'Preencha responsável, endereço e bairro.';
  END IF;

  INSERT INTO public.student_transport_registrations (
    school_id, student_id, student_name, class_code, shift, uses_transport,
    responsible_name, address, neighborhood, updated_at
  ) VALUES (
    st.school_id, st.id, st.full_name, st.class_code, st.turno, p_uses_transport,
    CASE WHEN p_uses_transport THEN btrim(p_responsible_name) ELSE NULL END,
    CASE WHEN p_uses_transport THEN btrim(p_address) ELSE NULL END,
    CASE WHEN p_uses_transport THEN btrim(p_neighborhood) ELSE NULL END,
    now()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    student_name = EXCLUDED.student_name,
    class_code = EXCLUDED.class_code,
    shift = EXCLUDED.shift,
    uses_transport = EXCLUDED.uses_transport,
    responsible_name = EXCLUDED.responsible_name,
    address = EXCLUDED.address,
    neighborhood = EXCLUDED.neighborhood,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_transport(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_portal_save_transport(uuid, text, boolean, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_transport(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_portal_save_transport(uuid, text, boolean, text, text, text) TO anon, authenticated;
