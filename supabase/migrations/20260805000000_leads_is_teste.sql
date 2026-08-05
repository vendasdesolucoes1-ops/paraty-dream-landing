-- Marca leads criados pelo painel "Testar Agente", para acompanhar a
-- movimentação automática (qualificação, round-robin, agenda) no CRM sem
-- sujar o funil real.

alter table leads add column if not exists is_teste boolean not null default false;

-- Índice parcial: serve para localizar e limpar os registros de teste, que são
-- poucos. Não cobre o filtro "esconder testes" do Kanban de propósito — esse
-- lê a maioria das linhas (is_teste = false) e não se beneficiaria de índice.
create index if not exists idx_leads_is_teste on leads (is_teste) where is_teste = true;

-- ---------------------------------------------------------------------------
-- LIMPEZA DOS LEADS DE TESTE — não roda nesta migration, é para uso manual.
--
-- As FKs que apontam para `leads` foram deixadas sem ON DELETE CASCADE de
-- propósito: cascata aqui valeria também para leads reais, e apagar um cliente
-- de verdade levaria junto todo o histórico dele. O preço é que a limpeza
-- precisa respeitar a ordem abaixo — um `delete from leads` direto falha com
-- erro de foreign key assim que o lead de teste tiver conversa ou visita.
--
-- Rode o bloco inteiro de uma vez, de cima para baixo:
--
--   begin;
--
--   -- 1. Mensagens do WhatsApp (bloqueia: sem ON DELETE)
--   delete from whatsapp_messages
--   where lead_id in (select id from leads where is_teste = true);
--
--   -- 2. Contatos do WhatsApp (bloqueia: sem ON DELETE).
--   -- Solta o vínculo em vez de apagar: `phone` é único e o contato pode ser
--   -- reaproveitado; a linha órfã não atrapalha nada.
--   update whatsapp_contacts set lead_id = null
--   where lead_id in (select id from leads where is_teste = true);
--
--   -- 3. Interações / timeline (bloqueia: sem ON DELETE)
--   delete from interacoes
--   where lead_id in (select id from leads where is_teste = true);
--
--   -- 4. Visitas agendadas (bloqueia: lead_id é NOT NULL)
--   delete from visitas
--   where lead_id in (select id from leads where is_teste = true);
--
--   -- 5. Por fim os próprios leads. documentos, compras e disparos_log têm
--   -- ON DELETE SET NULL e se resolvem sozinhos.
--   delete from leads where is_teste = true;
--
--   commit;
-- ---------------------------------------------------------------------------
