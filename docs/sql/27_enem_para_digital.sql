-- Aula do Enem Pará Digital: link do YouTube e dados da aula.

ALTER TABLE public.portal_informativos
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS aula_dados text,
  ADD COLUMN IF NOT EXISTS enem_digital boolean NOT NULL DEFAULT false;

ALTER TABLE public.portal_informativos
  DROP CONSTRAINT IF EXISTS portal_informativos_content_chk;

ALTER TABLE public.portal_informativos
  ADD CONSTRAINT portal_informativos_content_chk
  CHECK (
    (body_text IS NOT NULL AND length(btrim(body_text)) > 0)
    OR (image_data IS NOT NULL AND length(btrim(image_data)) > 0)
    OR (video_url IS NOT NULL AND length(btrim(video_url)) > 0)
  );

CREATE OR REPLACE FUNCTION public.student_portal_informativos(p_student_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  result jsonb;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT * INTO st FROM public.students WHERE id = p_student_id LIMIT 1;
  IF NOT FOUND OR st.school_id IS NULL OR coalesce(st.status, 'Ativo') <> 'Ativo' THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_at DESC NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT i.local_id AS id, i.title, i.body_text, i.image_data, i.layout, i.audience,
      i.class_codes, i.published_at, i.expires_at, i.created_by_name,
      i.video_url, i.aula_dados, i.enem_digital,
      coalesce(i.published_at, i.created_at) AS sort_at
    FROM public.portal_informativos i
    WHERE i.school_id = st.school_id
      AND i.status = 'publicado'
      AND coalesce(i.destinatario, 'alunos') IN ('alunos', 'ambos')
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (
        i.audience = 'todos'
        OR (i.audience = 'turmas' AND st.class_code IS NOT NULL AND st.class_code = ANY (i.class_codes))
      )
    ORDER BY coalesce(i.published_at, i.created_at) DESC
    LIMIT 50
  ) x;
  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_informativos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_informativos(uuid, text) TO anon, authenticated;
