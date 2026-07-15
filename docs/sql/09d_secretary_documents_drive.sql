-- SIGA EDUCA — links Drive em documentos da secretaria
ALTER TABLE public.secretary_documents
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_web_view_link text,
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_folder_path text;

COMMENT ON COLUMN public.secretary_documents.drive_file_id IS 'ID do arquivo no Google Drive institucional';
COMMENT ON COLUMN public.secretary_documents.drive_web_view_link IS 'URL para abrir/imprimir o arquivo no Drive';
COMMENT ON COLUMN public.secretary_documents.drive_folder_id IS 'Pasta Drive do tipo do documento';
COMMENT ON COLUMN public.secretary_documents.drive_folder_path IS 'Caminho legível SIGAEDUCA / Documentos Secretaria / Tipo';
