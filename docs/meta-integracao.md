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

## Saldo ao vivo (função `meta-saldo`)

A tela de Marketing (Visão geral e Anúncios) mostra o saldo da conta de anúncios
lido direto da Meta, sem passar pelo banco. O navegador chama `meta-saldo` a cada
minuto (e ao voltar para a aba); a função guarda o resultado por 30 s em memória.

- Quem pode chamar: admin e gestor logados, ou o segredo `cron_meta_secret`.
- Leituras na Graph API: a conta (`balance`, `amount_spent`, `spend_cap`,
  `is_prepay_account`, `funding_source_details`) e o gasto de hoje e dos últimos 7 dias.
- Conta pré-paga: o saldo vem do texto da forma de pagamento ("Saldo disponível (R$ …)").
  Conta pós-paga: mostra o valor acumulado a cobrar (`balance`).
- Os dias restantes usam o que acabar primeiro (saldo ou limite de gasto) dividido
  pela média diária dos últimos 7 dias. Abaixo de 3 dias aparece o aviso "Saldo acabando".

## Carga histórica (etapa 3)

- **Anúncios:** relatórios assíncronos da Meta, uma janela por mês, do mais recente até 37 meses atrás (estado `ads_historico`).
- **Instagram:** métricas da conta em lotes de 7 dias, até 90 dias atrás (estado `ig_historico`). Na primeira chamada também entram a conta, a demografia e todas as mídias com métricas.
- Cada chamada trabalha só enquanto cabe no limite de tempo da Edge Function e salva onde parou. Os crons `meta-carga-ads` e `meta-carga-instagram` chamam de novo a cada 10 minutos enquanto a carga não terminar.
- O progresso aparece na aba Integração (`marketing_progresso_carga`).
- O cron `meta-limpa-execucoes` marca como erro as execuções que ficaram "executando" porque a função foi encerrada pelo limite de tempo.
- **Alcance orgânico do Instagram:** é a soma do alcance dos posts, reels e stories publicados no período que não viraram anúncio. Um post conta como anúncio quando `creative.effective_instagram_media_id` aponta para ele. Como a mesma pessoa pode ter visto mais de um post, essa soma não é um número de pessoas únicas.

## Anúncio → CRM (etapa 4)

- **Anúncio WhatsApp:** na primeira mensagem de um contato novo, o webhook do WhatsApp lê `contextInfo.externalAdReply` (ID do anúncio, `ctwaClid`, título e URL) e chama `registrar_origem_anuncio`.
  - O lead passa a ter a origem `anuncio_whatsapp`, com `anuncio_id`, `anuncio_nome`, `campanha_id` e `campanha_nome`.
  - Quem já era lead mantém a origem que tinha.
  - Se o anúncio ainda não tiver sido sincronizado, o cron `crm-completar-anuncio` preenche os nomes de hora em hora.
- **Formulário Meta:** a origem `formulario_meta` já existe, mas ainda falta ligar o webhook `leadgen`. Ele depende da permissão `leads_retrieval` no token e de inscrever a Página no app.
- **Funil:** `marketing_funil_campanhas` cruza, por campanha:
  - o investimento e os contatos contados pela Meta;
  - os leads ligados à campanha, pela etapa do CRM em que estão hoje: qualificado, agendado, visitou, proposta ou fechado.

  A aba Anúncios mostra a tabela, e a Visão geral mostra o custo por visita agendada, por visita feita e por venda.
