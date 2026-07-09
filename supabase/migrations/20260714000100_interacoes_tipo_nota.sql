-- Allows manual notes registered by a salesperson in the Lead detail drawer,
-- in addition to the interaction types already logged automatically
-- (whatsapp, ligacao, email, visita).

ALTER TABLE interacoes DROP CONSTRAINT IF EXISTS interacoes_tipo_check;
ALTER TABLE interacoes
  ADD CONSTRAINT interacoes_tipo_check
  CHECK (tipo IN ('whatsapp', 'ligacao', 'email', 'visita', 'nota'));
