-- Libera o Histórico Escolar do Ensino Médio nos documentos da secretaria.

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
      'Histórico Escolar do Ensino Médio'::text,
      'Requerimento de 2ª Via de Diploma'::text,
      'Requerimento de 2ª Via de Histórico Escolar'::text,
      'Requerimento de Transferência'::text,
      'Requerimento de Histórico e Diploma'::text
    ])
  );
