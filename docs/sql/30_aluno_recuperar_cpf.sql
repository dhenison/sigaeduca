-- Recuperação do acesso do aluno pelo CPF.
-- A senha antiga não volta: o banco só guarda o hash. A função emite uma senha nova
-- e devolve nome, e-mail institucional e essa senha. O hash não sai da função.

CREATE TABLE IF NOT EXISTS public.student_recover_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cpf_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_recover_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.student_recover_attempts FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS student_recover_attempts_cpf_idx
  ON public.student_recover_attempts (cpf_hash, created_at DESC);

CREATE OR REPLACE FUNCTION public.student_recover_access_by_cpf(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  cpf_digits text;
  cpf_key text;
  attempts int;
  st public.students%ROWTYPE;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea;
  i int;
  senha text := '';
  sum1 int;
  sum2 int;
  d1 int;
  d2 int;
  email_out text;
BEGIN
  cpf_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  IF length(cpf_digits) <> 11 OR cpf_digits ~ '^(\d)\1{10}$' THEN
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

  IF attempts >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limite');
  END IF;

  INSERT INTO public.student_recover_attempts (cpf_hash) VALUES (cpf_key);

  SELECT * INTO st
  FROM public.students
  WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = cpf_digits
    AND coalesce(status, 'Ativo') = 'Ativo'
    AND email IS NOT NULL
    AND btrim(email) <> ''
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  raw := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    senha := senha || substr(alphabet, (get_byte(raw, i) % length(alphabet)) + 1, 1);
  END LOOP;

  email_out := lower(btrim(st.email));

  UPDATE public.students
  SET password_hash = 'sha256:' || encode(
        digest(convert_to('siga-educa-local-v1|' || senha, 'UTF8'), 'sha256'),
        'hex'
      ),
      needs_password_set = false,
      updated_at = now()
  WHERE id = st.id;

  RETURN jsonb_build_object(
    'ok', true,
    'nome', st.full_name,
    'email', email_out,
    'senha', senha
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_recover_access_by_cpf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_recover_access_by_cpf(text) TO anon, authenticated;

COMMENT ON FUNCTION public.student_recover_access_by_cpf(text) IS
  'Recuperação do aluno por CPF. Não devolve o hash. Emite uma senha nova porque a anterior só existe como hash.';
