# Staging, backup e restauração

Issue #62. Objetivo: nenhuma migration, cron ou mudança de prompt chega à
produção sem passar por um ambiente de teste, e uma restauração de backup já
foi ensaiada com tempo medido.

## 1. Três camadas de teste antes da produção

| Camada | O que pega | Como roda | Custo |
| --- | --- | --- | --- |
| CI (`banco`) | SQL quebrado, migration fora de ordem, regra de negócio do banco (cadências, fila, campanhas, alertas) | `scripts/db/testar-migrations.sh` em todo PR | zero |
| Local (`supabase start`) | integração com Auth, Storage, Edge Functions e cron reais | na máquina de quem desenvolve | zero |
| Staging (projeto Supabase separado) | dados parecidos com os reais, Evolution de teste, evals da Sophia | antes de cada deploy em produção | um projeto a mais (ou Branching) |

### 1.1 CI: migrations do zero

`scripts/db/testar-migrations.sh` sobe um Postgres descartável, aplica as
migrations em ordem e roda `supabase/tests/*.sql`. As extensões do Supabase
(pg_cron, pg_net, pgvector, Vault) são imitadas por
`scripts/db/shim-supabase.sql`, então o teste valida o SQL e as regras, não o
comportamento dessas extensões. Migrations geradas fora de sequência pelo
Lovable recebem um ajuste de ordem em `scripts/db/preludios/`.

Rodar localmente: `scripts/db/testar-migrations.sh` (precisa de Postgres 15+
instalado; `PG_BIN` aponta para os binários se não estiverem no PATH).

### 1.2 Staging

Opção recomendada: **segundo projeto Supabase** (plano Free basta para staging).
Alternativa: Branching do Supabase (plano pago), que cria um banco por PR.

Montagem, uma vez:

1. Criar o projeto `moradas-staging` no mesmo organization.
2. `supabase link --project-ref <ref-do-staging>` numa cópia local do repo.
3. `supabase db push` aplica todas as migrations.
4. Cadastrar no Vault do staging os mesmos nomes de segredo da produção
   (`cron_fila_secret`, `evolution_webhook_secret`, `ai_agent_chat_secret`,
   `service_role_key`, e opcionalmente `alerta_webhook_url` e `heartbeat_url`)
   com **valores diferentes** dos de produção.
5. Secrets das Edge Functions (`supabase secrets set`): `OPENAI_API_KEY`
   (pode ser a mesma conta, com limite de gasto), `GEMINI_API_KEY`, e as URLs
   do próprio staging.
6. Uma instância da Evolution só de teste, com um chip de teste. **Nunca**
   conectar o número de produção ao staging.
7. Dados: nunca copiar a base de produção crua. Para testar com volume, usar
   `pg_dump` da produção com anonimização (nome, telefone, e-mail, CPF trocados)
   ou um seed sintético.
8. No GitHub: variável `EVAL_HABILITADO=true` e os segredos
   `EVAL_SUPABASE_URL`, `EVAL_SERVICE_ROLE_KEY`, `EVAL_AGENT_ID` (do staging) e
   `EVAL_OPENAI_API_KEY` ligam o job de evals.

Fluxo de cada entrega:

1. PR verde no CI (app, Edge Functions, banco).
2. `supabase db push` e `supabase functions deploy` no staging.
3. Evals da Sophia e do classificador no staging.
4. Roteiro manual curto: formulário do site → primeiro contato → resposta →
   visita → lembrete; campanha de 3 leads de teste; alerta da fila (parar o
   cron por 15 min e conferir que o alerta chega).
5. Só então produção, na ordem do guia de entrada no ar (`docs/entrada-no-ar.md`).

## 2. Backup

O que verificar no painel do Supabase da produção (Project Settings → Add-ons /
Database → Backups):

- **Plano Free:** não há backup diário acessível pelo painel. É obrigatório o
  backup próprio da seção 2.1.
- **Plano Pro:** backup diário com retenção de 7 dias (RPO de até 24 h).
- **PITR (add-on):** restauração para qualquer segundo da janela contratada
  (RPO de minutos). Recomendado quando a operação depender da Sophia.

Registrar aqui o que foi confirmado:

| Item | Valor | Conferido por | Data |
| --- | --- | --- | --- |
| Plano | | | |
| Backup diário | sim / não | | |
| PITR | sim / não, janela | | |
| Retenção | | | |

### 2.1 Backup próprio (independente do plano)

Diário, fora do Supabase:

```bash
# Esquema + dados (sem os schemas internos do Supabase)
pg_dump "$URL_DO_BANCO" --no-owner --no-privileges \
  --schema=public --format=custom --file="moradas-$(date +%F).dump"
```

- `URL_DO_BANCO` vem de Project Settings → Database → Connection string
  (usar a conexão direta, porta 5432), guardada como segredo do agendador.
- Guardar em armazenamento com criptografia e acesso restrito (o dump tem dados
  pessoais: vale a LGPD). Retenção sugerida: 30 dias.
- Storage (fotos do Imagery, documentos, mídias de campanha) não entra no
  `pg_dump`: sincronizar os buckets com `supabase storage` ou pela API.
- Segredos do Vault não entram no dump em texto claro: manter a lista de
  segredos e de onde vem cada valor neste documento (sem os valores).

## 3. Ensaio de restauração

Fazer na implantação e a cada 6 meses. Nunca restaurar sobre a produção num
ensaio: restaurar no staging (ou num projeto novo) e medir.

1. Anotar a hora de início.
2. Criar o projeto de destino (ou limpar o staging).
3. `pg_restore --no-owner --no-privileges -d "$URL_DESTINO" moradas-AAAA-MM-DD.dump`
   (ou, com PITR/backup do plano, "Restore" no painel para um projeto novo).
4. Recriar segredos do Vault e secrets das Edge Functions; `supabase functions deploy`.
5. Conferir: contagem de `leads`, `whatsapp_messages`, `visitas`; login no painel;
   abrir 3 leads e a agenda; `select * from public.saude_fila_completa()` como gestor.
6. Anotar a hora de fim.

| Ensaio | Origem do backup | RPO (dados perdidos) | RTO (tempo até operar) | Responsável | Observações |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Metas sugeridas: RPO ≤ 24 h sem PITR (≤ 5 min com PITR); RTO ≤ 4 h.

## 4. Incidente: a produção caiu ou foi corrompida

1. Pausar a IA e os envios: desligar o agente no painel (Configurações → IA),
   o que também segura a fila e as cadências (`ai_agents.is_active`).
2. Decidir o ponto de restauração (último backup íntegro).
3. Restaurar num projeto novo, não por cima do quebrado: preserva a evidência.
4. Apontar o site e a Evolution (URL do webhook) para o projeto restaurado.
5. Registrar o incidente: o que aconteceu, dados perdidos, tempo fora do ar.
   Se houve vazamento de dados pessoais, avaliar a comunicação à ANPD e aos
   titulares (LGPD, art. 48).
