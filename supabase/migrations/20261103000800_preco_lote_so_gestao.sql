-- Preço do lote só para a gestão, no banco. Aplicar DEPOIS de publicar o
-- painel que lê `lotes_painel` (a tela antiga lia `lotes.valor` direto).
-- Vendedor continua lendo `lotes` (disponibilidade), mas sem a coluna valor.
revoke select on public.lotes from authenticated;
grant select (id, quadra, numero_lote, metragem, tipo, status, observacoes,
              posicao_x, posicao_y, created_at)
  on public.lotes to authenticated;

notify pgrst, 'reload schema';
