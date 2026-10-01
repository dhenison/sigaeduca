-- Consulta do professor: e-mail institucional e matrícula.
-- Até 3 tentativas em 30 minutos. Só então devolve nome, e-mail e senha.

CREATE TABLE IF NOT EXISTS public.staff_recover_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_recover_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff_recover_attempts FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS staff_recover_attempts_email_idx
  ON public.staff_recover_attempts (email_hash, created_at DESC);

CREATE OR REPLACE FUNCTION public.staff_recover_access_by_identity(
  p_email text,
  p_employee_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  email_in text;
  matricula_digits text;
  email_key text;
  attempts int;
  st public.school_staff%ROWTYPE;
  senha text;
BEGIN
  email_in := lower(btrim(coalesce(p_email, '')));
  matricula_digits := regexp_replace(coalesce(p_employee_id, ''), '\D', '', 'g');

  IF email_in !~ '^[^@\s]+@escola\.seduc\.pa\.gov\.br$'
     OR length(matricula_digits) < 5
     OR length(matricula_digits) > 12 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  email_key := encode(digest(convert_to(email_in, 'UTF8'), 'sha256'), 'hex');

  DELETE FROM public.staff_recover_attempts
  WHERE created_at < now() - interval '1 day';

  SELECT count(*) INTO attempts
  FROM public.staff_recover_attempts
  WHERE email_hash = email_key
    AND created_at > now() - interval '30 minutes';

  IF attempts >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limite');
  END IF;

  INSERT INTO public.staff_recover_attempts (email_hash)
  VALUES (email_key);

  attempts := attempts + 1;

  SELECT s.* INTO st
  FROM public.school_staff s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE lower(btrim(s.email)) = email_in
    AND coalesce(s.status, 'Ativo') = 'Ativo'
    AND (
      regexp_replace(coalesce(s.employee_id, ''), '\D', '', 'g') = matricula_digits
      OR regexp_replace(coalesce(p.employee_id, ''), '\D', '', 'g') = matricula_digits
    )
  ORDER BY s.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    IF attempts >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'limite');
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'nao_encontrado',
      'restantes', 3 - attempts
    );
  END IF;

  SELECT btrim(access_password) INTO senha
  FROM public.staff_access_secrets
  WHERE staff_id = st.id;

  RETURN jsonb_build_object(
    'ok', true,
    'nome', st.full_name,
    'email', lower(btrim(st.email)),
    'senha', nullif(senha, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.staff_recover_access_by_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_recover_access_by_identity(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.staff_recover_access_by_identity(text, text) IS
  'Devolve nome, e-mail e senha do servidor somente com e-mail institucional e matrícula corretos. Limite de 3 tentativas em 30 minutos.';
