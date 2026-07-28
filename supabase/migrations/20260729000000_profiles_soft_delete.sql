-- Exclusão de membro da equipe por soft delete.
--
-- Nunca apagar a linha de profiles: vendedores.profile_id e documentos.uploaded_by
-- referenciam profiles com NO ACTION, então um DELETE físico falharia sempre que
-- o membro tivesse vendedor vinculado ou documento enviado. Marcar deletado_em
-- preserva todo o histórico e ainda tira a pessoa da lista da Equipe.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletado_em TIMESTAMPTZ;

-- A listagem da Equipe filtra sempre por deletado_em IS NULL.
CREATE INDEX IF NOT EXISTS profiles_deletado_em_idx
  ON public.profiles (deletado_em)
  WHERE deletado_em IS NULL;
