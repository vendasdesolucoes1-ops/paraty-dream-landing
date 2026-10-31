# Integração Meta (Ads + Instagram)

Puxa campanhas, métricas e dados do Instagram da Moradas de Paraty para o nosso
banco, todo dia (e os stories toda hora). Só leitura: nada é publicado ou
alterado na Meta por esta integração.

- App Meta: "Moradas Paraty Integração" (modo desenvolvimento)
- Portfólio empresarial: "Moradas de Paraty 1"
- Usuário do sistema: "MoradasIntegracao" (token permanente)
- Ativos: conta de anúncios "VS - Moradas", Página "Moradas de Paraty" e
  Instagram @moradasdeparaty

## O que roda e quando

| Job (função) | Quando | O que faz |
| --- | --- | --- |
| `meta-sync-ads` | diário, 03h–05h (Brasília) | estrutura (campanhas, conjuntos, anúncios, inclusive arquivados e excluídos) + métricas diárias dos últimos 28 dias |
| `meta-sync-instagram` | diário, 03h–05h | snapshot da conta, insights dos últimos 3 dias fechados, demografia, posts dos últimos 30 dias com insights |
| `meta-sync-stories` | de hora em hora | stories no ar (ficam 24 h) e suas métricas |
| `meta-backfill` | manual | carga inicial: 37 meses de Ads (mês a mês) ou o acervo do Instagram |

Os crons de Ads e Instagram disparam 4 vezes na janela da madrugada de propósito:
a função **pula** se já houve sucesso nas últimas 20 h e **retoma** o que ficou
pela metade (limite de tempo da Edge Function, rate limit da Meta). Na prática só
a primeira tentativa do dia trabalha. `?forcar=1` ignora a guarda.

Tudo é **idempotente**: upsert por ID da Meta (`(ad_id, data)` nas métricas), então
rodar duas vezes não duplica nada.

## Variáveis de ambiente

Ficam como **secrets das Edge Functions** do Supabase. Nunca no código, no front
(`VITE_*`) nem em commit.

| Variável | Exemplo | Para quê |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | token do usuário do sistema | autenticação em todas as chamadas |
| `META_APP_SECRET` | segredo do app (Configurações → Básico) | `appsecret_proof` (HMAC-SHA256 do token) em toda chamada |
| `META_APP_ID` | `1125014300252722` | identificação do app |
| `META_AD_ACCOUNT_ID` | `act_XXXXXXXXX` (com o prefixo `act_`) | conta de anúncios |
| `META_PAGE_ID` | ID da Página | descobrir o ID do Instagram |

```bash
supabase secrets set META_ACCESS_TOKEN=... META_APP_SECRET=... META_APP_ID=... \
  META_AD_ACCOUNT_ID=act_... META_PAGE_ID=...
```

Se `META_ACCESS_TOKEN` ou `META_APP_SECRET` faltarem, as funções respondem `503`
com a mensagem do que falta. `.env.example` lista os nomes, sem valores.

## Colocar no ar

1. Aplicar as migrations `20261030000000` a `20261030000300` (estrutura, insights,
   Instagram, agendamento). A última cria o segredo `cron_meta_secret` no Vault e
   agenda os 3 crons.
2. Configurar os secrets acima.
3. Publicar as funções: `supabase functions deploy meta-sync-ads meta-sync-instagram meta-sync-stories meta-backfill`
   (já têm `verify_jwt = false` no `config.toml`; elas conferem o segredo por conta própria).
4. Rodar a carga inicial (abaixo). Os crons já agendados só passam a funcionar
   quando as funções existem e os secrets estão configurados.

## Carga inicial

O limite da Meta é de 37 meses. A carga anda mês a mês, **do mais recente para o
mais antigo**, e guarda o cursor em `meta_sync_estado`: se a execução acabar
antes (limite de tempo, rate limit), é só chamar de novo que ela continua.

```bash
# valor do segredo (só admin, no SQL Editor do Supabase):
#   select decrypted_secret from vault.decrypted_secrets where name = 'cron_meta_secret';
export SUPABASE_URL=https://<projeto>.supabase.co
export META_CRON_SECRET=<valor acima>

scripts/meta/carga-inicial.sh ads          # repete até concluir (use --reiniciar para recomeçar)
scripts/meta/carga-inicial.sh instagram    # acervo de posts + 30 dias de insights, uma chamada
```

Também dá para chamar `POST /functions/v1/meta-backfill?escopo=ads` logado como
admin. Acompanhar:

```sql
select job, status, registros, iniciado_em, finalizado_em, erro, codigo_erro, detalhes
  from meta_sync_execucoes order by iniciado_em desc limit 20;
select valor from meta_sync_estado where chave = 'ads_historico';  -- cursor da carga
```

## Dados

| Tabela | Conteúdo |
| --- | --- |
| `meta_conta_anuncios` | moeda e fuso da conta |
| `meta_campanhas`, `meta_conjuntos`, `meta_anuncios` | estrutura (targeting e `object_story_spec` em JSON) |
| `meta_insights_diarios` | métricas por anúncio e dia; `actions`, `action_values` etc. em JSON e totais principais em colunas |
| `meta_insights_breakdowns` | idade+gênero, plataforma+posição e região |
| `ig_conta_diaria`, `ig_insights_conta_diario`, `ig_demografia` | conta do Instagram |
| `ig_midias`, `ig_midia_insights` | posts, reels e stories e o valor mais recente de cada métrica |
| `meta_sync_execucoes`, `meta_sync_estado` | histórico de execuções e cursores |

Só a gestão (admin e gestor) lê essas tabelas; só as Edge Functions escrevem.
Orçamentos ficam na menor unidade da moeda (centavos); gasto, em unidade inteira.

Pontos de atenção na leitura dos números:

- **Colunas de ações:** a Meta repete o mesmo evento em vários `action_type`
  (`lead`, `lead_grouped`, `fb_pixel_lead`). Usamos o primeiro da lista de
  prioridade em `_shared/meta-actions.ts`, nunca a soma. "Reservas" é o evento de
  agendamento do pixel; se o negócio medir reserva de outro jeito, ajuste a lista
  (o JSON completo sempre fica guardado).
- **Reprocessamento:** a atribuição da Meta muda métricas retroativamente. Por isso
  o diário reprocessa os últimos 28 dias; números mais antigos que isso não são
  atualizados.
- **Datas:** as de Ads seguem o fuso da conta de anúncios; as do Instagram usam o
  dia civil de São Paulo (`America/Sao_Paulo`).
- **Instagram:** `impressions` foi descontinuada (usamos `views`). Métrica que a
  Meta recusar ou que a conta não tem (ex.: demografia com menos de 100 seguidores)
  é pulada e listada em `detalhes.indisponiveis` da execução, sem derrubar o job.
  Métrica sem dado não vira linha (a Meta devolve vazio, não zero). Story com
  poucos espectadores devolve erro 10 e é tentado de novo na hora seguinte.

## Token expirado ou revogado (erro 190)

A Meta responde erro 190. O cliente não repete, a execução termina como `erro`
com `codigo_erro = 190` e a gestão é avisada: notificação no painel e, se
existir o segredo `alerta_webhook_url` no Vault, mensagem no webhook (no máximo
um alerta a cada 6 h). Os logs registram `token_invalido` (nunca o token).

Gerar um novo token:

1. Meta Business Suite → Configurações do negócio → Usuários → **Usuários do
   sistema** → `MoradasIntegracao`.
2. **Gerar token**, escolher o app "Moradas Paraty Integração" e a validade
   (permanente, se disponível).
3. Marcar as permissões: `ads_read`, `ads_management`, `business_management`,
   `pages_show_list`, `pages_read_engagement`, `instagram_basic`,
   `instagram_manage_insights`.
4. Copiar o token e atualizar o secret: `supabase secrets set META_ACCESS_TOKEN=...`
5. Conferir: `POST .../meta-sync-stories` (rápido) deve responder `ok: true`. O cron
   seguinte retoma sozinho.

Se o `META_APP_SECRET` for trocado, atualize o secret também (toda chamada leva o
`appsecret_proof`).

## Cliente da Graph API (`_shared/meta-graph.ts`)

- Versão numa constante: `GRAPH_VERSION` (hoje `v26.0`). Para subir de versão,
  troque a constante e rode os testes; a Meta mantém cada versão por cerca de 2 anos.
- Retry com backoff exponencial para erros transitórios e de rate limit (códigos
  1, 2, 4, 17, 32, 613 e 80000–80014), desacelerando pelos headers
  `X-App-Usage`, `X-Business-Use-Case-Usage` e `X-Ad-Account-Usage`. Bloqueio
  maior que 60 s não é esperado dentro da execução: o job termina e o cron tenta
  depois (o estado fica salvo).
- Paginação por `paging.next`, revalidando o host e reassinando cada página.
- Logs estruturados em JSON, sem token, proof nem query string.
- Na primeira chamada de cada instância das funções, a verificação de boot
  descobre o ID do Instagram pela Página e loga as contas acessíveis
  (evento `boot_contas_acessiveis`).

## Testes

```bash
node --test "supabase/functions/_shared/meta-*.test.ts"   # cliente, parsing, syncs, jobs (Meta simulada)
scripts/db/testar-migrations.sh                           # migrations do zero + testes SQL (meta_*.test.sql)
```

Os testes usam respostas simuladas: nenhuma chamada real à Meta. O primeiro sync
real merece acompanhamento nos logs e em `meta_sync_execucoes`.
