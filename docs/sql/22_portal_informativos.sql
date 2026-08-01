-- SIGA EDUCA — Informativos do Portal do Aluno
-- Staff (authenticated) CRUD por escola; aluno lê só via RPC SECURITY DEFINER (anon).

CREATE TABLE IF NOT EXISTS public.portal_informativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  local_id text NOT NULL,
  title text NOT NULL,
  body_text text,
  image_data text,
  layout text NOT NULL DEFAULT 'texto_imagem',
  audience text NOT NULL DEFAULT 'todos',
  class_codes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'publicado',
  published_at timestamptz,
  expires_at timestamptz,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_informativos_local_unique UNIQUE (school_id, local_id),
  CONSTRAINT portal_informativos_title_chk CHECK (length(btrim(title)) > 0),
  CONSTRAINT portal_informativos_layout_chk CHECK (
    layout = ANY (ARRAY[
      'texto'::text,
      'imagem'::text,
      'texto_imagem'::text,
      'imagem_texto'::text
    ])
  ),
  CONSTRAINT portal_informativos_audience_chk CHECK (
    audience = ANY (ARRAY['todos'::text, 'turmas'::text])
  ),
  CONSTRAINT portal_informativos_status_chk CHECK (
    status = ANY (ARRAY['rascunho'::text, 'publicado'::text, 'arquivado'::text])
  ),
  CONSTRAINT portal_informativos_content_chk CHECK (
    (body_text IS NOT NULL AND length(btrim(body_text)) > 0)
    OR (image_data IS NOT NULL AND length(btrim(image_data)) > 0)
  )
);

COMMENT ON TABLE public.portal_informativos IS
  'Mensagens/informativos da escola exibidos somente no Portal do Aluno';
COMMENT ON COLUMN public.portal_informativos.image_data IS
  'Data URL da imagem (JPEG/PNG comprimida no cliente) ou NULL';
COMMENT ON COLUMN public.portal_informativos.layout IS
  'texto | imagem | texto_imagem | imagem_texto';

CREATE INDEX IF NOT EXISTS portal_informativos_school_idx
  ON public.portal_informativos (school_id);

CREATE INDEX IF NOT EXISTS portal_informativos_published_idx
  ON public.portal_informativos (school_id, status, published_at DESC);

DROP TRIGGER IF EXISTS trg_portal_informativos_updated ON public.portal_informativos;
CREATE TRIGGER trg_portal_informativos_updated
  BEFORE UPDATE ON public.portal_informativos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_informativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_informativos_select ON public.portal_informativos;
CREATE POLICY portal_informativos_select ON public.portal_informativos
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS portal_informativos_insert ON public.portal_informativos;
CREATE POLICY portal_informativos_insert ON public.portal_informativos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS portal_informativos_update ON public.portal_informativos;
CREATE POLICY portal_informativos_update ON public.portal_informativos
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

DROP POLICY IF EXISTS portal_informativos_delete ON public.portal_informativos;
CREATE POLICY portal_informativos_delete ON public.portal_informativos
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_informativos TO authenticated;
REVOKE ALL ON TABLE public.portal_informativos FROM anon;

-- Portal do aluno (anon): lista somente informativos publicados e válidos da escola do aluno
CREATE OR REPLACE FUNCTION public.student_portal_informativos(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st public.students%ROWTYPE;
  result jsonb;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO st
  FROM public.students
  WHERE id = p_student_id
  LIMIT 1;

  IF NOT FOUND OR st.school_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF coalesce(st.status, 'Ativo') <> 'Ativo' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_at DESC NULLS LAST), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      i.local_id AS id,
      i.title,
      i.body_text,
      i.image_data,
      i.layout,
      i.audience,
      i.class_codes,
      i.published_at,
      i.expires_at,
      i.created_by_name,
      coalesce(i.published_at, i.created_at) AS sort_at
    FROM public.portal_informativos i
    WHERE i.school_id = st.school_id
      AND i.status = 'publicado'
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (
        i.audience = 'todos'
        OR (
          i.audience = 'turmas'
          AND st.class_code IS NOT NULL
          AND st.class_code = ANY (i.class_codes)
        )
      )
    ORDER BY coalesce(i.published_at, i.created_at) DESC
    LIMIT 50
  ) x;

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_informativos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_portal_informativos(uuid) TO anon, authenticated;
