-- Campos estruturados da qualificação do agente de IA.
--
-- Até aqui, "objetivo" e "forma de pagamento" só existiam soltos no texto da
-- conversa (whatsapp_messages/interacoes) — o agente era instruído a descobrir
-- essas informações no prompt, mas nada era gravado em coluna. Isso impedia
-- montar o resumo de qualificação por template confiável para o vendedor.
--
-- cidade e metragem_interesse já existem em leads desde o schema inicial; só
-- faltava passar a preenchê-las (feito no whatsapp-webhook, via extração
-- estruturada em JSON mode).

alter table leads add column if not exists objetivo text;

-- Constraint separada do ADD COLUMN para ser idempotente: rodar a migration
-- duas vezes não pode falhar por constraint já existente.
alter table leads drop constraint if exists leads_objetivo_check;
alter table leads
  add constraint leads_objetivo_check
  check (objetivo is null or objetivo in ('moradia', 'investimento', 'temporada'));

-- Sem CHECK: a forma de pagamento é texto livre normalizado pela extração
-- ("à vista", "financiado", "FGTS", "consórcio", combinações). Uma lista fixa
-- rejeitaria respostas legítimas do lead e faria a extração perder o dado.
alter table leads add column if not exists forma_pagamento text;
