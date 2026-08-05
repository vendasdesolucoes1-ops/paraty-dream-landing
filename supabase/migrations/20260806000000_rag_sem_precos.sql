-- Revisão da base de conhecimento da Sophia (v3.0).
--
-- Motivo: a v2.0 era injetada inteira no prompt a cada mensagem e continha
-- material que contradizia diretamente as regras do agente:
--   * tabela de R$/m², 23 preços de lote e o parcelamento do Lote 25, contra a
--     regra de PRIORIDADE MÁXIMA de nunca informar valor;
--   * um roteiro de qualificação de 8 itens (incluindo forma de pagamento, que
--     o prompt proíbe perguntar) e um bloco "REGRAS DO AGENTE" mandando "usar
--     os preços exatos desta base" — ou seja, uma segunda especificação de
--     comportamento competindo com o prompt versionado em código;
--   * contagem de lotes livres por quadra ("44 lotes, Quadras 3, 7"), hoje
--     falsa e substituída pela consulta em tempo real à tabela `lotes`;
--   * 5 placeholders [PREENCHER], que o modelo podia repetir para o lead.
--
-- O conteúdo comercial não foi descartado: migra para `rag_comercial_interno`,
-- que NÃO é lida pela ai-agent-chat e serve só de referência para a equipe.

-- ---------------------------------------------------------------------------
-- 1. Base lida pela Sophia — sem preço, sem roteiro, sem disponibilidade.
-- ---------------------------------------------------------------------------
update configuracoes set valor = $rag$# BASE DE CONHECIMENTO — AGENTE COMERCIAL IA
## Moradas de Paraty | Loteamento Residencial Sophia Saíde
### Versão 3.0 — Sem dados comerciais | Agosto 2026

> Esta base é injetada no prompt da Sophia a cada mensagem. Ela NÃO contém
> preço, condição de pagamento nem roteiro de atendimento: valores nunca são
> informados ao lead, e o comportamento do agente é definido no código
> (buildSystemPrompt), não aqui. Disponibilidade de lote vem da consulta em
> tempo real à tabela `lotes`, nunca deste documento.

---

## 1. IDENTIDADE DO EMPREENDIMENTO

| Campo | Valor |
|---|---|
| Nome comercial | Moradas de Paraty |
| Nome oficial | Loteamento Residencial Sophia Saíde |
| Proprietário | Residencial Sophia Saíde Empreendimentos SPE Ltda |
| CNPJ | 37.489.760/0001-14 |
| Procuradora | Maria Aparecida Carvalho Silveira — CPF 083.266.098-11 |
| Endereço | Estrada Paraty-Cunha (RJ 165), Bananal, Paraty/RJ |
| CEP | 23.970-000 |
| Zona de uso | ZOR-02 (Zona Residencial 02 — Lei Municipal 48/2017 LUOPS) |
| Matrícula | Livro 2-A, ficha 5686, matrícula nº 3487 — Registro Geral de Imóveis |
| Aprovação | Prefeitura Municipal de Paraty — Folha 3763/2021 |
| Arquiteto responsável | Marco Antonio Gama Corrêa — CAU A23852-0 |
| Distância do centro | 9 minutos do Centro Histórico de Paraty (Rod. Paraty-Cunha) |

---

## 2. ESTRUTURA DO LOTEAMENTO

### 2.1 Dados gerais oficiais

| Item | Valor |
|---|---|
| Área total da gleba | 118.574,11m² |
| Área destinada ao loteamento | 115.494,27m² |
| Área de recuo da rodovia | 3.079,84m² |
| Total de lotes | 163 lotes |
| Lotes residenciais | 142 lotes — 41.917,23m² (51,33%) |
| Lotes comerciais | 21 lotes — 8.736,27m² (10,70%) |
| Áreas verdes | 5 áreas — 8.399,64m² (10,28%) |
| Área institucional | 1 área — 6.535,95m² (8,00%) |
| Vias públicas | 16.110,33m² (19,72%) |
| Faixa marginal de proteção | 16.612,72m² (mata ciliar — Rio Perequê-açu) |

### 2.2 Distribuição por quadra (estrutura física do projeto)

| Quadra | Tipo | Lotes no projeto | Área total (m²) |
|---|---|---|---|
| 1 | Comercial (LC) | 9 | 3.678,70 |
| 2 | Comercial (LC) | 10 | 3.602,49 |
| 3 | Residencial (LR) | 25 | 6.636,28 |
| 4 | Residencial (LR) | 26 | 3.976,28 |
| 5 | Residencial (LR) | 16 | 4.535,41 |
| 6 | Mista (LC+LR) | 11 | 7.143,00 |
| 7 | Residencial (LR) | 27 | 6.985,96 |
| 8 | Residencial (LR) | 20 | 7.062,99 |
| 9 | Residencial (LR) | 12 | 4.410,24 |
| 10 | Residencial (LR) | 7 | 2.622,15 |

> "Lotes no projeto" é quantos existem na planta aprovada — NÃO quantos estão
> livres. Disponibilidade só vem do bloco em tempo real.

### 2.3 Faixas de metragem que existem no projeto

| Metragem | Tipo |
|---|---|
| 150m² | Residencial |
| 153,15m² | Residencial |
| 169,07m² | Residencial |
| 250m² | Residencial |
| 360m² | Residencial |
| 450m²+ | Residencial |
| 360–811m² | Comercial |

> Catálogo do projeto, não estoque. Quantos existem e em quais quadras estão
> livres HOJE vem do bloco de disponibilidade em tempo real.

---

## 3. CONDIÇÕES E DOCUMENTAÇÃO

### 3.1 Documentação necessária para proposta
- Nome completo, CPF, RG
- Data de nascimento, nacionalidade, estado civil
- Profissão e renda mensal estimada
- E-mail e WhatsApp
- Endereço completo
- RG, CPF, Comprovante de Residência e Estado Civil (envio posterior)

### 3.2 LGPD
O cliente autoriza o uso de seus dados para análise de crédito e confecção do
contrato. A proposta não garante reserva até aprovação e confirmação do sinal.

---

## 4. INFRAESTRUTURA DO EMPREENDIMENTO

### 4.1 O que o projeto inclui (conforme Memorial Descritivo)

| Item | Detalhe |
|---|---|
| Terraplanagem | Etapa 1 — 3 meses |
| Arruamento e abertura de praças | Etapa 2 |
| Drenagem pluvial (galerias) | Etapa 3 |
| Abastecimento de água | Etapa 4 |
| Pavimentação asfáltica | Etapa 5 |
| Caixas de inspeção e bocas de lobo | Etapa 6 |
| Meio-fio ao longo das vias | Etapa 7 |
| Rede elétrica e iluminação pública | Etapa 8 |
| Arborização de ruas e praças | Etapa 9 |

### 4.2 Sistema viário
- Avenida principal: 18m de largura (a partir da rodovia)
- Ruas locais internas: 13m de largura
- Vias com continuidade com o loteamento vizinho

### 4.3 Esgotamento sanitário
- Sistema individual por fossa séptica com filtro e sumidouro ou biodigestor
- Padrão exigido pela Prefeitura de Paraty + Águas de Paraty
- Construção fica a cargo do proprietário do lote no início da edificação

### 4.4 Áreas verdes e preservação
- 5 áreas verdes totalizando 8.399,64m²
- Faixa marginal de proteção: 16.612,72m² ao longo do Rio Perequê-açu
- Área de preservação estágio médio: 12.579,50m²
- Acesso à mata existente no morro integrado às áreas verdes

---

## 5. DIFERENCIAIS

### 5.1 Localização
- A 9 minutos do Centro Histórico de Paraty pela Rod. Paraty-Cunha (RJ 165)
- Acesso direto pela rodovia estadual asfaltada
- Entre a Serra do Mar e o Rio Perequê-açu
- Próximo a cachoeiras, trilhas e mirantes da Serra da Bocaina
- Paraty: Patrimônio Mundial UNESCO desde 2019

### 5.2 O empreendimento
- Bairro planejado, com associação de moradores
- Projeto aprovado pela Prefeitura Municipal de Paraty (processo 3763/2021)
- 163 lotes de 150m² a 811m² — variedade para todos os perfis
- **Já entregue com asfalto, água e iluminação** — não é promessa de obra futura
- Um Ipê plantado em frente a cada lote
- Áreas verdes preservadas e integradas ao projeto
- Faixa de preservação do Rio Perequê-açu garante natureza permanente
- Lotes planos e regulares — fáceis de construir

### 5.3 Lazer (aos fundos do loteamento)
- Espaço Pet
- Academia ao ar livre
- Playground

### 5.4 Facilidade de compra
- Financiamento direto com o loteador, sem depender de banco
- Mencione apenas a FACILIDADE. Nunca cite valor, entrada, número de parcelas
  ou qualquer condição financeira — isso é conversa da visita.

### 5.5 Contexto de investimento
- Paraty é destino consolidado de ecoturismo e turismo histórico
- Limitação natural de expansão urbana (APP + Mata Atlântica) valoriza os lotes

### 5.6 Objeções comuns

| Objeção | Resposta |
|---|---|
| "Paraty é longe" | Fica a 4h de SP e 4h30 do Rio pela BR-101. É o destino mais procurado da Costa Verde. |
| "Prefiro comprar na praia" | Aqui você tem qualidade de vida a 9 minutos da orla, com lote maior e mais tranquilidade. |
| "O lote não tem casa" | Você constrói do seu jeito, no seu tempo. Muitos clientes compram hoje e constroem em 2–3 anos. |
| "Paraty é tombada, não posso construir" | O tombamento é do Centro Histórico, não da cidade toda. Este loteamento tem projeto aprovado pela prefeitura. |
| "E o esgoto?" | Sistema individual por fossa séptica/biodigestor — padrão da região, aprovado pela prefeitura e pela Águas de Paraty. |
| "Tem área verde?" | Sim — 5 áreas verdes dentro do loteamento + faixa de preservação do Rio Perequê-açu. |
| "É loteamento fechado?" | É um bairro planejado, com associação de moradores. |
| "Quanto custa?" | Valor eu prefiro passar pessoalmente, na visita. |
| "Aceita FGTS/financiamento?" | Temos financiamento direto com o loteador. As condições eu explico pessoalmente na visita. |
$rag$
where chave = 'rag_conhecimento';

-- ---------------------------------------------------------------------------
-- 2. Conteúdo comercial — referência interna da equipe.
--    NÃO é lida pela ai-agent-chat: nada aqui chega ao prompt da Sophia.
-- ---------------------------------------------------------------------------
insert into configuracoes (chave, valor)
values ('rag_comercial_interno', $com$# CONDIÇÕES COMERCIAIS — USO INTERNO
## Moradas de Paraty | Referência da equipe de vendas

> ⚠️ Este documento NÃO é lido pelo agente de IA e nunca chega ao lead.
> Foi separado da base de conhecimento justamente porque a Sophia não pode
> informar valores. Serve para consulta humana.

---

## 1. Preço por m² por segmento (Junho 2026)

| Segmento | Valor por m² | Lotes aplicáveis |
|---|---|---|
| Residencial padrão (250m²) | R$ 1.220,00/m² | Quadra 3 |
| Residencial médio (360m²) | R$ 1.198,00/m² | Quadras 5 e 8 |
| Residencial grande (600m²+) | R$ 1.400,00/m² | Quadra 6 (lotes 89–97) |
| Residencial premium | R$ 1.450,00/m² | Quadras 9 e 10 |
| Comercial | R$ 1.580,00/m² | Quadras 1, 2, 6 (LC) |

## 2. Exemplos de preço total

| Quadra | Lote | Metragem | Tipo | Preço Total |
|---|---|---|---|---|
| 1 | 4 | 360m² | Comercial | R$ 568.800,00 |
| 1 | 8 | 397,50m² | Comercial | R$ 628.050,00 |
| 2 | 16 | 360,21m² | Comercial | R$ 569.131,80 |
| 3 | 25 | 250m² | Residencial | R$ 305.000,00 |
| 3 | 33 | 360,13m² | Residencial | R$ 439.358,60 |
| 3 | 34 | 452,15m² | Residencial | R$ 551.623,00 |
| 5 | 74 | 363,80m² | Residencial | R$ 435.832,40 |
| 5 | 79 | 450,02m² | Residencial | R$ 539.123,96 |
| 6 | 88 | 643,97m² | Comercial | R$ 1.017.472,60 |
| 6 | 89 | 623,51m² | Residencial | R$ 872.914,00 |
| 8 | 125 | 360,17m² | Residencial | R$ 431.483,66 |
| 8 | 135 | 291,25m² | Residencial | R$ 348.917,50 |
| 9 | 145 | 450,24m² | Residencial | R$ 652.848,00 |
| 10 | 163 | 462,15m² | Residencial | R$ 670.117,50 |

> O `valor` de cada lote também está na tabela `lotes` do banco, calculado a
> partir das taxas por m² acima.

## 3. Formas de pagamento

| Modalidade | Disponível | Detalhe |
|---|---|---|
| Entrada (sinal) | Sim | Pix, TED ou Boleto |
| Parcelamento direto com incorporador | Sim | Ver nota abaixo sobre o prazo |
| À vista | Sim | Consultar desconto |
| Financiamento bancário | A confirmar | Confirmar com Fernando |
| FGTS | A confirmar | Confirmar com Fernando |

### ⚠️ Prazo de parcelamento — PENDENTE DE CONFIRMAÇÃO

- **Documentado até aqui:** até 180 parcelas mensais.
- **Informação nova:** até 240 parcelas.
- **Origem:** anúncio de uma vendedora terceira, NÃO documentação oficial.
- **Status: A CONFIRMAR COM O FERNANDO** antes de usar com qualquer cliente.

Enquanto não houver confirmação, a equipe deve tratar 180x como o prazo
oficial e não prometer 240x.

## 4. Exemplo de parcelamento (Lote 25 — venda de referência)
- Lote: Quadra 3, Lote 25 — 250m² — Residencial
- Valor total: R$ 305.000,00
- Entrada (10%): R$ 30.500,00 via Pix
- Parcelamento: 180 parcelas mensais de R$ 2.877,80

## 5. Pendências gerais
- [ ] Confirmar aceite de FGTS e financiamento bancário
- [ ] Confirmar prazo de parcelamento (180x ou 240x)
- [ ] Confirmar prazo para escritura após sinal
- [ ] Definir horários de visita disponíveis
- [ ] Confirmar desconto para pagamento à vista
$com$)
on conflict (chave) do update set valor = excluded.valor;
