-- Índices para responder "este lead já recebeu disparo?" na tela de seleção.
--
-- A seleção manual de leads mostra, por contato, se ele já foi alvo de algum
-- disparo e quando. A consulta varre disparos_itens por lead_id e por telefone
-- ATRAVÉS DE TODAS as campanhas — os índices existentes são por campanha_id e
-- por status, que servem para abrir uma campanha no histórico e não ajudam
-- nada aqui.
--
-- O casamento é por lead_id OU telefone porque lead_id é NULL quando o contato
-- veio de CSV ou de lista manual: sem o telefone, um lead do CRM que já
-- recebeu disparo por outra fonte apareceria como "nunca contatado".

create index if not exists idx_disparos_itens_lead_id
  on public.disparos_itens (lead_id)
  where lead_id is not null;

create index if not exists idx_disparos_itens_telefone
  on public.disparos_itens (telefone);

notify pgrst, 'reload schema';
