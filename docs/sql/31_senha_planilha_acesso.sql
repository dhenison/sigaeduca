-- A senha da planilha é a senha de acesso.
-- Ela fica numa tabela fechada, sem leitura pela API.
-- A recuperação devolve essa senha e não cria outra.

CREATE TABLE IF NOT EXISTS public.student_access_secrets (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  access_password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_access_secrets_not_blank CHECK (length(btrim(access_password)) > 0)
);

ALTER TABLE public.student_access_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.student_access_secrets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.student_save_spreadsheet_passwords(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  item jsonb;
  cpf_digits text;
  senha text;
  st public.students%ROWTYPE;
  saved int := 0;
  skipped int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sem_sessao', 'saved', 0, 'skipped', 0);
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalido', 'saved', 0, 'skipped', 0);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    cpf_digits := regexp_replace(coalesce(item->>'cpf', ''), '\D', '', 'g');
    senha := btrim(coalesce(item->>'senha', ''));
    IF length(cpf_digits) <> 11 OR length(senha) < 1 OR length(senha) > 80 THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    SELECT * INTO st
    FROM public.students
    WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = cpf_digits
      AND coalesce(status, 'Ativo') = 'Ativo'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF NOT public.user_can_access_school(st.school_id) AND NOT public.is_system_admin() THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.students
    SET password_hash = 'sha256:' || encode(
          digest(convert_to('siga-educa-local-v1|' || senha, 'UTF8'), 'sha256'),
          'hex'
        ),
        needs_password_set = false,
        updated_at = now()
    WHERE id = st.id;

    INSERT INTO public.student_access_secrets (student_id, access_password)
    VALUES (st.id, senha)
    ON CONFLICT (student_id) DO UPDATE
      SET access_password = EXCLUDED.access_password,
          updated_at = now();

    saved := saved + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'saved', saved, 'skipped', skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.student_save_spreadsheet_passwords(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_save_spreadsheet_passwords(jsonb) TO authenticated;

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
  i int;
  sum1 int;
  sum2 int;
  d1 int;
  d2 int;
  email_out text;
  senha text;
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
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nao_encontrado');
  END IF;

  email_out := lower(btrim(st.email));

  SELECT btrim(access_password) INTO senha
  FROM public.student_access_secrets
  WHERE student_id = st.id;

  IF senha IS NULL OR senha = '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'nome', st.full_name,
      'email', email_out,
      'reason', 'planilha'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'nome', st.full_name,
    'email', email_out,
    'senha', senha
  );
END;
$$;

COMMENT ON FUNCTION public.student_recover_access_by_cpf(text) IS
  'Devolve a senha gravada na importação da planilha. Não cria senha nova e não altera o hash.';
