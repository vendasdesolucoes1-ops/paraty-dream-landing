-- Recusa e opt-out do lead.
--
-- Até aqui o agente tinha três saídas — qualificado, visita agendada, falar com
-- humano — e todas significam avanço no funil. Não havia nenhuma para "o lead
-- não quer", e nenhum lugar onde guardar essa informação. O efeito prático era
-- o agente insistir na visita mensagem após mensagem, porque a recusa da
-- mensagem anterior não sobrevivia à seguinte.
--
-- Também não existia opt-out em lugar nenhum do sistema: um lead que pedisse
-- para parar continuava elegível para todo disparo em massa futuro, e a única
-- proteção era alguém lembrar de desmarcá-lo campanha a campanha. É assim que
-- se coleciona denúncia, e denúncia derruba o número que atende todos os
-- outros leads.

alter table public.leads
  -- Nível leve: recusou a visita. Não muda o funil e não bloqueia nada — serve
  -- para o prompt saber que não pode convidar de novo nesta conversa.
  add column if not exists recusou_visita_em timestamptz,
  add column if not exists recusas_visita integer not null default 0,

  -- Nível duro: confirmou que não quer seguir.
  add column if not exists sem_interesse_em timestamptz,
  add column if not exists contato_bloqueado boolean not null default false;

-- Coluna própria, e NÃO derivada de status_crm = 'perdido', porque as duas
-- coisas são diferentes: um lead dado como perdido por sumiço continua
-- elegível para reengajamento; um lead que pediu para parar, não. Derivar uma
-- da outra faz o opt-out evaporar no dia em que alguém reabrir o card no CRM.
comment on column public.leads.contato_bloqueado is
  'O lead pediu para não receber mais contato. Bloqueia envio ATIVO (disparo em massa, fila, reengajamento). Não bloqueia resposta a mensagem que ele mesmo enviar — nesse caso a whatsapp-webhook limpa o bloqueio e a conversa volta.';

comment on column public.leads.recusas_visita is
  'Quantas vezes o lead recusou a visita. Duas recusas promovem para sem_interesse automaticamente, em código, sem depender de o modelo emitir a marca.';

-- O disparador filtra por esta coluna em toda campanha, e a esmagadora maioria
-- dos leads é false — índice parcial indexa só o que interessa.
create index if not exists idx_leads_contato_bloqueado
  on public.leads (id)
  where contato_bloqueado;

notify pgrst, 'reload schema';
