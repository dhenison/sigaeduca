-- Consulta do aluno: CPF e data de nascimento.
-- Até 3 tentativas em 30 minutos. Só então devolve nome, e-mail e senha.
-- CPF sozinho não devolve nada. A função de um argumento foi removida.

ALTER TABLE public.student_recover_attempts
  ADD COLUMN IF NOT EXISTS ip_hash text;

DROP FUNCTION IF EXISTS public.student_recover_access_by_cpf(text);

CREATE OR REPLACE FUNCTION public.student_recover_access_by_cpf(
  p_cpf text,
  p_birth_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  cpf_digits text;
  cpf_key text;
  attempts int;
  i int;
  sum1 int;
  sum2 int;
  d1 int;
  d2 int;
  st public.students%ROWTYPE;
  email_out text;
  senha text;
BEGIN
  cpf_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  IF p_birth_date IS NULL
     OR length(cpf_digits) <> 11
     OR cpf_digits ~ '^(\d)\1{10}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  sum1 := 0;
  FOR i IN 1..9 LOOP
    sum1 := sum1 + substring(cpf_digits, i, 1)::int * (11 - i);
  END LOOP;
  d1 := sum1 % 11;
  d1 := CASE WHEN d1 < 2 THEN 0 ELSE 11 - d1 END;
  IF d1 <> substring(cpf_digits, 10, 1)::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  sum2 := 0;
  FOR i IN 1..10 LOOP
    sum2 := sum2 + substring(cpf_digits, i, 1)::int * (12 - i);
  END LOOP;
  d2 := sum2 % 11;
  d2 := CASE WHEN d2 < 2 THEN 0 ELSE 11 - d2 END;
  IF d2 <> substring(cpf_digits, 11, 1)::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  cpf_key := encode(digest(convert_to(cpf_digits, 'UTF8'), 'sha256'), 'hex');

  DELETE FROM public.student_recover_attempts
  WHERE created_at < now() - interval '1 day';

  SELECT count(*) INTO attempts
  FROM public.student_recover_attempts
  WHERE cpf_hash = cpf_key
    AND created_at > now() - interval '30 minutes';

  IF attempts >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limite');
  END IF;

  INSERT INTO public.student_recover_attempts (cpf_hash)
  VALUES (cpf_key);

  attempts := attempts + 1;

  SELECT * INTO st
  FROM public.students
  WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = cpf_digits
    AND birth_date = p_birth_date
    AND coalesce(status, 'Ativo') = 'Ativo'
    AND email IS NOT NULL
    AND btrim(email) <> ''
  ORDER BY updated_at DESC NULLS LAST
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

  email_out := lower(btrim(st.email));

  SELECT btrim(access_password) INTO senha
  FROM public.student_access_secrets
  WHERE student_id = st.id;

  RETURN jsonb_build_object(
    'ok', true,
    'nome', st.full_name,
    'email', email_out,
    'senha', nullif(senha, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_recover_access_by_cpf(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_recover_access_by_cpf(text, date) TO anon, authenticated;

COMMENT ON FUNCTION public.student_recover_access_by_cpf(text, date) IS
  'Devolve nome, e-mail e senha somente com CPF e data de nascimento corretos. Limite de 3 tentativas em 30 minutos.';
