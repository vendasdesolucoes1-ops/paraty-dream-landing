# Guia de entrada no ar

Tudo o que está no branch `claude/dreamy-knuth-ozn7l3` e ainda **não** está em
produção: o que muda, o que precisa ser decidido antes, a ordem de implantação e
como voltar atrás. Nada aqui foi aplicado no Supabase de produção.

## 1. Decisões que são de vocês (antes de ligar)

| # | Decisão | Onde pesa | Padrão no código |
| --- | --- | --- | --- |
| D1 | ~~Condições comerciais oficiais~~ **Resolvido:** a gestão cria, edita e escolhe a vigente em Configurações → Condições comerciais | landing e Imagery | começa vigente "Condição de lançamento" (10% + 240x), igual ao que a landing já mostra |
| D2 | ~~Identidade da Sophia~~ **Resolvido (18/10):** não se apresenta como virtual; se perguntarem diretamente, não mente (diz que é a assistente digital da equipe e oferece um consultor) | prompt da Sophia | aplicado |
| D3 | ~~Texto do consentimento~~ **Aprovado (18/10).** Falta o RIPD/DPA com os provedores — #48 | `LeadForm` | texto atual |
| D4 | Campanha exige base legal (consentimento ou conversa iniciada pelo lead)? | Configurações → Cadências → Regras de envio | **exige** (leads só raspados do Google Maps não recebem campanha) |
| D5 | Limite diário por número, rampa de aquecimento, máx. de tentativas, limite de opt-out | Regras de envio | 150/dia, rampa 20→150 em 21 dias só para número novo, 2 tentativas, pausa com opt-out > 5% (mín. 20 envios) |
| D6 | Ligar as cadências "Lembretes de visita" e "Sem resposta ao primeiro contato" (revisar o texto antes) | Cadências | **desligadas** |
| D7 | Piloto da IA no follow-up: quais etapas usam "IA com aprovação" e a meta de acerto | Cadências → etapa → modo; eval `EVAL_META_ACERTO` | nenhuma etapa usa IA |
| D8 | Janelas de horário de visita | Configurações → Horários de visita | seg–sex 9h–17h, sáb 9h–16h, 60 min |
| D9 | Aceite formal do risco de banimento e roteiro de continuidade — #63 | `docs/risco-evolution-continuidade.md` | a assinar |
| D10 | Plano do Supabase: backup diário / PITR — #62 | `docs/operacao-staging-backup.md` | a confirmar |

## 2. O que muda para quem usa

- **Segurança:** as funções exigem login com o papel certo ou segredo de
  máquina; o vendedor só vê os leads da própria carteira; a chave da Evolution
  some do navegador; segredos ficam no Vault. A URL do webhook da Evolution
  **muda** (passa a ter token) — ver passo 4.
- **Atendimento:** opt-out por palavra-chave antes da IA; a Sophia não rebaixa
  etapa nem marca visita fora da janela (visita "a confirmar" para o vendedor);
  áudio é transcrito (ou a Sophia pede texto); mídia sem legenda avisa o
  vendedor; respostas pela fila durável, com debounce.
- **Follow-up:** cadências com regras da Evolution, lembretes de visita,
  campanhas que continuam com a aba fechada, aprovação humana dos textos da IA,
  métricas por etapa, alerta quando a fila para.
- **CRM:** tarefas e SLA, propostas e forecast, metas e relatórios de
  conversão, notificações, exportação, busca sem acento, auditoria de
  alterações, exclusão completa do titular (LGPD), opt-out só desfeito pela
  gestão com justificativa.
- **Muda de lugar:** o disparo em massa sai do laço no navegador e vira
  campanha no servidor (mesmas regras das cadências), acompanhada em
  Ferramentas. Mudanças que a equipe vai notar:
  - a campanha usa só leads do CRM: as fontes "CSV" e "lista manual" saíram
    (importe os contatos como leads antes; assim opt-out e base legal valem);
  - a variável do texto é `{{primeiro_nome}}` (antes `{{nome}}`/`{{telefone}}`);
  - o histórico de disparos antigos continua visível na aba "Histórico antigo".
- **Novo menu "Follow-up"** (gestão): cadências, aprovação dos textos da IA,
  métricas e saúde da fila, regras de envio. No detalhe do lead, aba
  "Follow-up" com as inscrições do lead.

## 3. Antes do dia

1. **Staging** (recomendado): aplicar tudo num projeto de staging seguindo
   `docs/operacao-staging-backup.md` e passar o roteiro manual curto da seção 1.2.
2. **Backup** da produção (`pg_dump`, seção 2.1 do mesmo documento) feito no dia.
3. **Conferências na produção** (só leitura, no SQL Editor):
   ```sql
   -- A migration do acervo foi reconstruída do código: confira se bate.
   select pg_get_functiondef('public.pick_acervo_image(text, text)'::regprocedure);
   select policyname from pg_policies where tablename = 'imagery_acervo';
   -- Duplicados pela chave canônica de telefone (a migration não funde nada,
   -- só passa a enxergar): resolver no CRM antes, se houver.
   ```
   A visão `leads_telefone_duplicado` só existe depois da migration; antes,
   rode a consulta equivalente sobre `leads` se quiser saber o volume.
4. **Imagem da capa do Imagery:** confirmar em `imagery_logs` se o modelo
   `gemini-3-pro-image` (em `_shared/modelos.ts`) tem falhado; se sim, trocar
   pelo ID estável atual antes do deploy.
5. **Janela de manutenção** curta (30–60 min) fora do horário de atendimento:
   o painel antigo não funciona com o banco novo (ele lê a chave da Evolution,
   que deixa de ser legível), então banco e site precisam subir juntos.

## 4. Ordem de implantação

> Banco primeiro, depois site, depois funções, depois Evolution. Não inverter:
> o site novo usa RPCs e colunas que só existem depois das migrations.

1. **Pausar a IA** no painel (desliga respostas, fila e cadências).
2. **Migrations** (26 arquivos, de `20261016000000` a `20261018000900`):
   `supabase db push` com o projeto de produção linkado. Se o Lovable aplicar
   migrations por conta própria ao sincronizar, confirme no editor do Lovable
   que todas rodaram, na ordem, sem erro.
3. **Site:** merge do PR na `main` (o Lovable publica o frontend). Conferir login,
   CRM e agenda.
4. **Edge Functions:** `supabase functions deploy` de todas (inclui a nova
   `followup-redigir`). `processar-fila-mensagens`, `whatsapp-webhook` e
   `rag-admin` precisam subir **sem verificação de JWT** (já configurado em
   `supabase/config.toml`): o cron e a Evolution se autenticam por segredo, e com
   JWT o gateway recusaria (401) e a fila e o recebimento parariam. Se o deploy for
   pelo Lovable, confira essa opção nas três. `generate-post` e
   `publish-instagram` passam a responder 410 de propósito.
5. **Secrets das funções** (`supabase secrets set`), opcionais:
   `OPENAI_FALLBACK_MODEL` (modelo reserva da Sophia), `EVOLUTION_ALLOWED_HOSTS`
   (hosts permitidos para a URL da Evolution, separados por vírgula).
6. **Webhook da Evolution:** pegar a nova URL e colar na instância da Evolution:
   ```sql
   select public.url_webhook_evolution();
   ```
   Até isso ser feito, o webhook antigo é recusado (401) e nenhuma mensagem
   recebida chega ao CRM.
7. **Alertas externos** (opcional, recomendado): no Vault, `alerta_webhook_url`
   (Slack ou similar, recebe `{"text": ...}`) e `heartbeat_url` (ex.:
   healthchecks.io, pingado a cada 5 min).
8. **Religar a IA** e testar com um número de teste: mandar mensagem, receber
   resposta; marcar visita; pedir "SAIR".
9. **Decisões D4–D8** no painel, e só então ligar as cadências desejadas.

## 5. Como saber que está saudável (primeiras 48 h)

- Cadências → Métricas → **Saúde da fila**: pendentes vencidas perto de 0,
  últimas execuções "ok".
- Notificações do painel sem `fila_alerta`.
- `ai_chamadas`: erros e custo por função.
- Uma conversa real ponta a ponta revisada no CRM.

## 6. Como voltar atrás

- **Problema só no site:** reverter o merge na `main` não basta (o banco novo
  não serve ao site antigo). Preferir corrigir para frente; em último caso,
  restaurar o backup do passo 3.2 e reverter o merge juntos.
- **Problema nas funções:** `supabase functions deploy` da versão anterior
  (a `main` antiga) para a função afetada.
- **Envios indevidos:** desligar a IA (para fila, cadências e campanhas) e a
  cadência no painel; campanhas têm "Cancelar campanha".
- **Migrations:** não há "down". Rollback de banco = restaurar o backup.

## 7. Verificação feita neste branch

- CI: typecheck, testes unitários (Edge Functions e app), lint dos arquivos
  alterados, build, `deno check` de todas as funções, auditoria de dependências.
- Banco: `scripts/db/testar-migrations.sh` aplica as 76 migrations num Postgres
  limpo e roda os testes SQL (cadências, campanhas, métricas, alerta, busca,
  opt-out, opções do agente, aprovação e agente único por instância).
- **Não verificado:** comportamento real de pg_cron, pg_net, Vault e pgvector
  (imitados no teste), a Evolution real e os modelos de IA (evals rodam quando
  houver staging configurado).
