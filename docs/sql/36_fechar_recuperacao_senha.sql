-- SUPERADA por docs/sql/37_consulta_aluno_cpf_nascimento.sql. Não aplicar este arquivo de novo.
-- A recuperação pelo CPF não devolve mais nome, e-mail nem senha.
-- Qualquer CPF válido recebe a mesma resposta: procurar a secretaria.
-- O limite de tentativas continua valendo.

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
  ip_attempts int;
  i int;
  sum1 int;
  sum2 int;
  d1 int;
  d2 int;
  headers text;
  ip text;
  ip_key text;
BEGIN
  cpf_digits := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  IF length(cpf_digits) <> 11 OR cpf_digits ~ '^(\d)\1{10}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'procure_secretaria');
  END IF;

  sum1 := 0;
  FOR i IN 1..9 LOOP
    sum1 := sum1 + substring(cpf_digits, i, 1)::int * (11 - i);
  END LOOP;
  d1 := sum1 % 11;
  d1 := CASE WHEN d1 < 2 THEN 0 ELSE 11 - d1 END;
  IF d1 <> substring(cpf_digits, 10, 1)::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'procure_secretaria');
  END IF;

  sum2 := 0;
  FOR i IN 1..10 LOOP
    sum2 := sum2 + substring(cpf_digits, i, 1)::int * (12 - i);
  END LOOP;
  d2 := sum2 % 11;
  d2 := CASE WHEN d2 < 2 THEN 0 ELSE 11 - d2 END;
  IF d2 <> substring(cpf_digits, 11, 1)::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'procure_secretaria');
  END IF;

  cpf_key := encode(digest(convert_to(cpf_digits, 'UTF8'), 'sha256'), 'hex');

  headers := current_setting('request.headers', true);
  ip := 'sem-ip';
  IF headers IS NOT NULL AND btrim(headers) <> '' THEN
    BEGIN
      ip := coalesce(
        nullif(btrim(split_part(coalesce(headers::json->>'x-forwarded-for', ''), ',', 1)), ''),
        nullif(btrim(coalesce(headers::json->>'cf-connecting-ip', '')), ''),
        'sem-ip'
      );
    EXCEPTION WHEN OTHERS THEN
      ip := 'sem-ip';
    END;
  END IF;
  ip_key := encode(digest(convert_to(ip, 'UTF8'), 'sha256'), 'hex');

  DELETE FROM public.student_recover_attempts
  WHERE created_at < now() - interval '1 day';

  SELECT count(*) INTO attempts
  FROM public.student_recover_attempts
  WHERE cpf_hash = cpf_key
    AND created_at > now() - interval '30 minutes';

  IF attempts >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limite');
  END IF;

  SELECT count(*) INTO ip_attempts
  FROM public.student_recover_attempts
  WHERE ip_hash = ip_key
    AND created_at > now() - interval '30 minutes';

  IF ip_attempts >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limite');
  END IF;

  INSERT INTO public.student_recover_attempts (cpf_hash, ip_hash)
  VALUES (cpf_key, ip_key);

  RETURN jsonb_build_object('ok', false, 'reason', 'procure_secretaria');
END;
$$;

REVOKE ALL ON FUNCTION public.student_recover_access_by_cpf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_recover_access_by_cpf(text) TO anon, authenticated;

COMMENT ON FUNCTION public.student_recover_access_by_cpf(text) IS
  'Não devolve senha, nome nem e-mail. Orienta a procurar a secretaria. Limite de 5 tentativas por CPF e 20 por origem, em 30 minutos.';
