-- SIGA EDUCA — Frequência: consolidação individual por marca
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Pré-requisito: 05_frequencia.sql
--
-- Reconhecimento facial grava P + locked=true + source='facial'.
-- A UI bloqueia edição por aluno/fase; Saída libera após Entrada locked.
-- Botões Consolidar Entrada/Saída em lote ficam desativados nesse fluxo.

ALTER TABLE public.attendance_marks
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.attendance_marks
  DROP CONSTRAINT IF EXISTS attendance_marks_source_chk;

ALTER TABLE public.attendance_marks
  ADD CONSTRAINT attendance_marks_source_chk
  CHECK (source = ANY (ARRAY['manual'::text, 'facial'::text, 'import'::text]));

COMMENT ON COLUMN public.attendance_marks.locked IS
  'Consolidação individual: true = fechado para edição (ex.: batida facial)';
COMMENT ON COLUMN public.attendance_marks.source IS
  'Origem da marca: manual | facial | import';

CREATE INDEX IF NOT EXISTS attendance_marks_locked_idx
  ON public.attendance_marks (call_id, phase, locked);
