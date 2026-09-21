-- Boletim único (sem bimestre) visível no aplicativo do aluno.
ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS file_base64 text;

ALTER TABLE public.report_cards
  DROP CONSTRAINT IF EXISTS report_cards_file_base64_len;

ALTER TABLE public.report_cards
  ADD CONSTRAINT report_cards_file_base64_len
  CHECK (file_base64 IS NULL OR char_length(file_base64) <= 8000000);

CREATE OR REPLACE FUNCTION public.student_portal_reports(
  p_student_id uuid,
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', rc.id,
      'file_name', rc.file_name,
      'year_label', rc.year_label,
      'term_label', rc.term_label,
      'class_code', rc.class_code
    ) ORDER BY rc.published_at DESC)
    FROM public.report_cards rc
    WHERE rc.student_id = p_student_id
      AND rc.file_base64 IS NOT NULL
      AND length(btrim(rc.file_base64)) > 0
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_portal_report_pdf(
  p_student_id uuid,
  p_token text,
  p_card_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload text;
BEGIN
  IF NOT public.student_portal_token_ok(p_student_id, p_token) THEN
    RETURN NULL;
  END IF;
  SELECT rc.file_base64 INTO payload
  FROM public.report_cards rc
  WHERE rc.id = p_card_id
    AND rc.student_id = p_student_id
  LIMIT 1;
  RETURN payload;
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_reports(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_portal_report_pdf(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_reports(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_portal_report_pdf(uuid, text, uuid) TO anon, authenticated;
