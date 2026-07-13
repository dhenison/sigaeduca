-- SIGA EDUCA — Atestado de Conclusão / Histórico e Diploma
-- Execute no SQL Editor do Supabase se 09_documentos_secretaria.sql já tiver sido aplicado.
--
-- Inclui:
--   - novos tipos de documento
--   - filiação (mãe/pai)
--   - nome do aluno digitável (student_id pode ficar NULL)

ALTER TABLE public.secretary_documents
  DROP CONSTRAINT IF EXISTS secretary_documents_type_chk;

ALTER TABLE public.secretary_documents
  ADD CONSTRAINT secretary_documents_type_chk CHECK (
    doc_type = ANY (ARRAY[
      'Declaração de Matrícula'::text,
      'Declaração de Frequência (Bolsa Família)'::text,
      'Declaração de Escolaridade'::text,
      'Declaração de Vaga'::text,
      'Declaração de Transferência'::text,
      'Atestado de Conclusão'::text,
      'Requerimento de 2ª Via de Diploma'::text,
      'Requerimento de 2ª Via de Histórico Escolar'::text,
      'Requerimento de Transferência'::text,
      'Requerimento de Histórico e Diploma'::text
    ])
  );

ALTER TABLE public.secretary_documents
  ADD COLUMN IF NOT EXISTS mother_name text;

ALTER TABLE public.secretary_documents
  ADD COLUMN IF NOT EXISTS father_name text;

COMMENT ON COLUMN public.secretary_documents.year_label IS 'Ano letivo informado (ex.: Atestado de Conclusão)';
COMMENT ON COLUMN public.secretary_documents.mother_name IS 'Nome da mãe (Atestado de Conclusão; digitação livre)';
COMMENT ON COLUMN public.secretary_documents.father_name IS 'Nome do pai (Atestado de Conclusão; digitação livre)';
COMMENT ON COLUMN public.secretary_documents.student_id IS 'FK opcional; NULL quando o nome é digitado manualmente (ex.: Atestado de Conclusão)';
COMMENT ON COLUMN public.secretary_documents.student_name IS 'Nome do aluno; pode ser preenchido manualmente sem student_id';
