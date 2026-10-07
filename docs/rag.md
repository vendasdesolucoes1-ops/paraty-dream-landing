# RAG da Sophia

Base de conhecimento vetorizada (pgvector) com busca híbrida, avaliação medida e
recuo seguro para o comportamento anterior.

- **Estado:** índice criado e populado em produção; `rag-admin` publicado; o uso
  pela Sophia (`ai-agent-chat`) entra no ar **no merge desta branch** (ver
  [Colocando no ar](#colocando-no-ar)).
- **Issues:** [VHA-75](https://linear.app/vhandc-tech/issue/VHA-75) (esta entrega; origem:
  relatório de auditoria, seção IA, ponto 2 — "a base entra inteira no prompt, sem busca") ·
  [VHA-71](https://linear.app/vhandc-tech/issue/VHA-71) (recomendação original) ·
  desdobramentos: [VHA-76](https://linear.app/vhandc-tech/issue/VHA-76) (segredo do Vault),
  [VHA-77](https://linear.app/vhandc-tech/issue/VHA-77) (painel),
  [VHA-78](https://linear.app/vhandc-tech/issue/VHA-78) (operação contínua),
  [VHA-79](https://linear.app/vhandc-tech/issue/VHA-79) (advisors de segurança).

## Resumo

Antes, `configuracoes.rag_conhecimento` (~7 mil caracteres) ia **inteira** no prompt a
cada mensagem. Agora a Sophia recebe só os trechos da base que respondem à mensagem
do lead; quando a busca não tem confiança, ela volta à base inteira.

| Item                       | Valor                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Modelo de embedding        | `text-embedding-3-small` (1536 dimensões), mesma chave OpenAI   |
| Trechos na base v3.0       | 17 (≈ 340 caracteres em média, máx. 800)                        |
| Busca                      | vetor (cosseno) + texto (português), fusão RRF, top-5           |
| Acerto no top-5 (35 casos) | **97,1 %** · MRR 0,793                                          |
| Texto da base por mensagem | ≈ 2 mil caracteres no lugar de ≈ 7 mil (estimativa, ver abaixo) |
| Custo de embedding         | ≈ US$ 0,000002 por mensagem; ≈ US$ 0,00004 para reindexar tudo  |

A economia de tokens é **modesta hoje** (≈ 1,2 mil dos ≈ 6 mil tokens de entrada por
resposta) porque a base é pequena. O ganho real é estrutural: a base pode crescer
(Memorial Descritivo, regras do loteamento, FAQ) sem o custo e o ruído crescerem junto,
e cada resposta passa a ser **auditável** (`rag_consultas`). Os números reais de
tokens e latência saem de `rag_consultas` depois que a Sophia começar a usar a busca.

## Como funciona

```
                 painel (Configurações → Agente → Base de conhecimento)
                                   │ UPDATE configuracoes.valor
                                   ▼
            ┌───────── trigger rag_reindexar_ao_alterar ─────────┐
            │ pg_net + segredo rag_admin_secret (Vault)           │
            ▼                                                     │
   edge function rag-admin ── chunking ── embeddings (OpenAI) ───┤
            │                                                     │
            ▼  rag_substituir_chunks (transação atômica)          │
   rag_documentos · rag_chunks (vector + tsvector) ◄──────────────┘
            ▲
            │ rag_buscar (vetor + texto, RRF)
   ai-agent-chat ── resolverConhecimento ──► prompt da Sophia
            │            └─ recuo: base inteira
            └─► rag_consultas (auditoria)
```

**A fonte de verdade continua sendo `configuracoes.rag_conhecimento`.** `rag_chunks` é um
índice derivado e descartável: apagá-lo e salvar a base de novo o reconstrói.

### O que é vetorizado — e o que não é

| Dado                                | Vetorizado? | Por quê                                                                                                                                                                     |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rag_conhecimento` (base da Sophia) | **Sim**     | Texto livre, que cresce, consultado por significado.                                                                                                                        |
| `rag_comercial_interno` (preços)    | Não         | Preço nunca pode chegar ao lead. Está registrado em `rag_documentos` como `escopo = 'interno'`, `ativo = false`; a busca da Sophia filtra por `escopo = 'agente'`.          |
| `lotes` (disponibilidade)           | Não         | Dado estruturado e mutável. Responder "tem lote de 250 m²?" é SQL em tempo real (`blocoLotesDisponiveis`), não similaridade. Vetor aqui seria um jeito mais lento de errar. |
| `leads`, `whatsapp_messages`        | Não         | O histórico recente da conversa já vai inteiro no prompt (80 linhas). Embeddar conversa de lead é dado pessoal sem ganho hoje.                                              |

## Modelo de dados

Migration: `supabase/migrations/20261007000000_rag_pgvector.sql` (idempotente).

- **`rag_documentos`** — registro das chaves de `configuracoes` que são indexadas: `escopo`
  (`agente` | `interno`), `ativo`, e o estado do índice (`status`, `conteudo_hash`,
  `n_trechos`, `indexado_em`, `erro`).
- **`rag_chunks`** — um trecho por linha: `secao` (caminho de títulos), `conteudo`,
  `embedding vector(1536)` com índice HNSW (cosseno), `fts tsvector` (português) com GIN, e
  `hash` = sha256(modelo + texto embedado), usado para só reembedar o que mudou.
- **`rag_consultas`** — uma linha por mensagem: o que foi buscado, quais trechos voltaram, com
  que similaridade, o modo (`busca`/`completo`), o motivo do recuo e a latência.
- **Funções:** `rag_buscar` (produção), `rag_buscar_hibrido` (núcleo parametrizável, para
  calibrar), `rag_substituir_chunks` (aplica o índice numa transação), `rag_segredo_valido`,
  `rag_reindexar_ao_alterar` (gatilho).
- **Acesso:** RLS ligada nas três tabelas; só `admin`/`gestor` leem (para auditar); só o
  `service_role` (edge functions) escreve. As funções `rag_*` só executam como `service_role`.

## Chunking

`supabase/functions/_shared/rag-chunker.ts` (puro, com testes):

1. Unidade natural = seção (`##`/`###`). Nenhum trecho atravessa um título, e cada um leva o
   caminho completo: `5. DIFERENCIAIS > 5.6 Objeções comuns`.
2. Tabela só é quebrada quando passa de 800 caracteres, e **repete o cabeçalho** em cada
   pedaço (a tabela de objeções vira dois trechos legíveis sozinhos).
3. O cabeçalho do documento (título, versão, a nota "esta base não contém preço") é metadado de
   quem edita e **não vira trecho** — senão responderia "quanto custa?".
4. O texto embedado é `seção + conteúdo`. O nome do documento fica de fora de propósito:
   sendo igual em todos os trechos, ele os aproximava de qualquer pergunta que o citasse.

## Uma mensagem, passo a passo

`resolverConhecimento` (`_shared/rag.ts`), chamado por `ai-agent-chat`:

1. **Consulta.** A mensagem do lead; se for curta ("sim", "pode ser"), acrescenta a última fala
   da Sophia para dar assunto; se for longa, acrescenta a fala anterior do lead.
2. **Busca.** Embedding da consulta → `rag_buscar` → top-5 por fusão RRF (k = 10, peso do texto
   0,5).
3. **Critério de relevância.** Os trechos servem se o melhor cosseno ≥ 0,35, **ou** se ≥ 0,20 e
   algum trecho também casou na busca textual. Cosseno sozinho não separa pergunta real de
   conversa solta: "Qual é o CEP?" acerta em 1º com cosseno 0,25, e "Oi, tudo bem?" chega a 0,32.
4. **Recuo.** Se qualquer etapa falhar ou a busca não tiver confiança, o prompt leva a base
   inteira — **byte a byte o prompt de antes do RAG**. Motivos registrados:

| `motivo_recuo`        | Quando                                                               |
| --------------------- | -------------------------------------------------------------------- |
| `desativado`          | `rag_modo = 'completo'`, ou sem `OPENAI_API_KEY`                     |
| `erro`                | OpenAI ou banco falharam (timeout de 4 s no embedding)               |
| `indice_indisponivel` | nada voltou: índice vazio, em reindexação ou **desatualizado**       |
| `similaridade_baixa`  | a mensagem não tem resposta na base (conversa solta, assunto alheio) |

Índice desatualizado nunca é servido: `rag_buscar` compara o sha256 do texto atual de
`configuracoes` com o que foi indexado. Se alguém salvou a base e a reindexação ainda não
terminou, a Sophia usa a base inteira até o índice alcançar.

No modo `busca`, o prompt avisa o modelo de que vê **trechos** e de que o que não aparece neles
conta como _não confirmado_ (não como inexistente).

## Segredos

- **`rag_admin_secret`** (Vault): gerado pela migration, nunca exibido. O gatilho o envia em
  `x-rag-secret`; `rag-admin` pergunta ao banco se confere (`rag_segredo_valido`). Não há
  variável de ambiente para configurar.
- `rag-admin` também aceita um admin/gestor logado e a `SUPABASE_SERVICE_ROLE_KEY` do ambiente.
  Qualquer outra chamada recebe 401/403.
- **Achado — `vault.service_role_key` é um placeholder.** O segredo com esse nome tem 28
  caracteres e não é um JWT. O cron `processar-mensagens-agendadas` o envia como `Bearer`, e só
  funciona porque `processar-fila-mensagens` não confere autenticação. **Quando a
  [VHA-49](https://linear.app/vhandc-tech/issue/VHA-49) exigir autenticação nessa função, o cron
  passa a receber 401 e a fila de mensagens para.** Por isso o RAG não reaproveita esse segredo.

## Avaliação

`rag-admin {"action":"avaliar"}` roda 35 perguntas reais de lead (`_shared/rag-golden.ts`) e 5
mensagens fora da base. Cada pergunta traz as palavras que **precisam** aparecer nos trechos
recuperados.

Calibração da fusão (16 combinações, mesmo golden set, base v3.0):

| Configuração                     | Acerto no top-5 | MRR   |
| -------------------------------- | --------------- | ----- |
| Só vetor                         | 91,4 %          | 0,721 |
| RRF clássico (k = 60, pesos 1/1) | 94,3 %          | 0,765 |
| **k = 10, peso do texto 0,5**    | **97,1 %**      | 0,787 |

Depois de tirar o nome do documento do texto embedado: MRR 0,793. Critério de relevância:
**35/35** perguntas reais passam; **4/5** mensagens fora da base são barradas (a que passa é
"restaurante no Rio", que casa com "Rio Perequê-açu" — inofensivo: só significa que a Sophia
recebe trechos em vez da base inteira).

**Falha conhecida:** _"Onde fica o loteamento?"_. A palavra "loteamento" está no **título** de
metade das seções ("ESTRUTURA DO LOTEAMENTO"), e o trecho do endereço é uma linha numa tabela de
12 campos. As formas mais comuns da pergunta funcionam: _"Onde fica?"_ traz Localização e
Identidade nos 4 primeiros; _"Qual a localização do empreendimento? Como chego aí?"_ traz Identidade em 2º.
Correção barata, de conteúdo: renomear a linha `Endereço` para `Endereço / localização (onde
fica)` na base — fica a critério de quem cuida do texto.

Para recalibrar (por exemplo depois de crescer a base), varra a grade e escolha pelos números:

```json
{ "action": "avaliar", "grade": [{ "rrf_k": 10, "peso_vetor": 1, "peso_texto": 0.5 }] }
```

e então recrie o wrapper `rag_buscar` com os valores vencedores.

## Operação

Tudo roda pelo banco; o segredo nunca sai dele. Atalho para chamar o `rag-admin`:

```sql
select net.http_post(
  url     := 'https://<ref-do-projeto>.supabase.co/functions/v1/rag-admin',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-rag-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rag_admin_secret')
  ),
  body    := '{"action":"status"}'::jsonb          -- ver tabela abaixo
);
-- a resposta chega em segundos:
select status_code, content from net._http_response order by id desc limit 1;
```

| `body`                                                         | Faz                                                 |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `{"action":"status"}`                                          | estado do índice e do `rag_modo`                    |
| `{"action":"indexar"}`                                         | reindexa o que mudou (`"force":true` reembeda tudo) |
| `{"action":"buscar","consulta":"como é o esgoto?","limite":8}` | diagnóstico: o que a busca devolve, com scores      |
| `{"action":"avaliar"}`                                         | relatório completo no golden set                    |

**Editar a base:** Configurações → Agente → Base de conhecimento → Salvar. O gatilho reindexa
em segundos; só os trechos alterados são reembedados.

**Interruptor de emergência** (volta ao comportamento anterior na mensagem seguinte, sem deploy):

```sql
update configuracoes set valor = 'completo' where chave = 'rag_modo';  -- e 'busca' para religar
```

**Achar lacunas na base** — perguntas que a busca não soube responder:

```sql
select criado_em, consulta, motivo_recuo, melhor_similaridade
from rag_consultas
where modo = 'completo' and motivo_recuo = 'similaridade_baixa'
order by criado_em desc limit 50;
```

**Adicionar um documento** (ex.: Memorial Descritivo): insira a chave em `configuracoes` e uma
linha em `rag_documentos` (`escopo = 'agente'`, `ativo = true`); o gatilho (`rag_%`) indexa. Se o
conteúdo tiver preço ou condição comercial, use `escopo = 'interno'`.

## Limitações conhecidas

- `rag_buscar_hibrido` lê todos os trechos em dia antes de ordenar (a checagem de "índice em dia"
  é por documento). Ótimo até alguns milhares de trechos; acima disso, reestruturar para usar o
  índice HNSW diretamente.
- `rag_consultas` não tem rotina de retenção.
- O golden set é da base v3.0: ao mudar a base de forma relevante, ajuste as palavras esperadas.
- A decisão `Sophia nega ser IA` ([VHA-52](https://linear.app/vhandc-tech/issue/VHA-52)) e o prazo
  180x/240x ([VHA-51](https://linear.app/vhandc-tech/issue/VHA-51)) são de conteúdo/negócio; o RAG
  só entrega o texto que a base tiver.

## Colocando no ar

Já em produção (aplicado via MCP durante esta sessão): extensão `vector`, tabelas, funções, gatilho,
`rag_modo = 'busca'`, função `rag-admin` e o índice populado (17 trechos).

**Pendente — acontece no merge desta branch:** a nova `ai-agent-chat` (as edge functions do repositório são publicadas
pela integração com a Lovable). Até lá a Sophia segue com a base inteira. Depois do merge:

1. Painel → Agente → **Ver prompt** com uma pergunta ("como funciona o esgoto?") e conferir `rag`
   na resposta (`modo: busca`, trechos e similaridades).
2. Conversar 3–4 mensagens no **Testar Agente** e olhar `rag_consultas`.
3. Se algo estranho aparecer: `rag_modo = 'completo'` (acima).

Testes das partes puras: `npm run test:edge` (chunker, critério de relevância, recuos, embeddings).
