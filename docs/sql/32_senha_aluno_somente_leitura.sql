-- A senha do aluno só entra pela importação da planilha.
-- O sistema web pode mostrar, mas não altera.

CREATE OR REPLACE FUNCTION public.keep_student_password_from_sheet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('siga.allow_student_password', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.password_hash := OLD.password_hash;
    NEW.needs_password_set := OLD.needs_password_set;
  ELSE
    NEW.password_hash := NULL;
    NEW.needs_password_set := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_student_password ON public.students;
CREATE TRIGGER trg_keep_student_password
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_student_password_from_sheet();

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

  PERFORM set_config('siga.allow_student_password', 'on', true);

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

CREATE OR REPLACE FUNCTION public.student_view_access_password(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  st public.students%ROWTYPE;
  senha text;
BEGIN
  IF auth.uid() IS NULL OR p_student_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT public.user_can_access_school(st.school_id) AND NOT public.is_system_admin() THEN
    RETURN NULL;
  END IF;
  SELECT btrim(access_password) INTO senha
  FROM public.student_access_secrets
  WHERE student_id = st.id;
  RETURN NULLIF(senha, '');
END;
$$;

REVOKE ALL ON FUNCTION public.student_view_access_password(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_view_access_password(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_set_password_by_identity(
  p_cpf text,
  p_birth_date date,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN jsonb_build_object('ok', false, 'reason', 'senha_importacao');
END;
$$;
