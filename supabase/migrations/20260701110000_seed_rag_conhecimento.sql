-- Seeds the AI agent's knowledge base (RAG) used by ai-agent-chat.
-- Content: "Base de Conhecimento — Agente Comercial IA" v2.0 (Julho 2026).

insert into configuracoes (chave, valor)
values (
  'rag_conhecimento',
  $rag$# BASE DE CONHECIMENTO — AGENTE COMERCIAL IA
## Moradas de Paraty | Loteamento Residencial Sophia Saíde
### Versão 2.0 — Dados Oficiais Confirmados | Julho 2026

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
| Total comercializável | 163 lotes — 50.653,50m² (62,00%) |
| Áreas verdes | 5 áreas — 8.399,64m² (10,28%) |
| Área institucional | 1 área — 6.535,95m² (8,00%) |
| Vias públicas | 16.110,33m² (19,72%) |
| Faixa marginal de proteção | 16.612,72m² (mata ciliar — Rio Perequê-açu) |

### 2.2 Distribuição por quadra

| Quadra | Tipo | Lotes | Área total (m²) |
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

### 2.3 Faixas de metragem disponíveis

| Metragem | Quantidade | Tipo |
|---|---|---|
| 150m² | 22 lotes | Residencial (Quadra 4) |
| 153,15m² | 6 lotes | Residencial (Quadra 5) |
| 169,07m² | 5 lotes | Residencial (Quadras 4 e 5) |
| 250m² | 44 lotes | Residencial (Quadras 3, 7) |
| 255–256m² | 2 lotes | Residencial |
| 284,07m² | 2 lotes | Residencial (Quadra 3) |
| 291,15m² | 2 lotes | Residencial (Quadra 8) |
| 360m² | 31 lotes | Residencial (várias quadras) |
| 363–364m² | 9 lotes | Residencial (Quadra 5) |
| 397m² | 2 lotes | Comercial (Quadra 1) |
| 417m² | 1 lote | Comercial (Quadra 1) |
| 450–462m² | 5 lotes | Residencial/Comercial |
| 492m² | 1 lote | Comercial (Quadra 2) |
| 618–630m² | 5 lotes | Residencial (Quadra 6) |
| 635–643m² | 4 lotes | Residencial/Comercial (Quadra 6) |
| 533,71m² | 1 lote | Comercial (Quadra 1, Lote 1) |
| 643,97m² | 1 lote | Comercial (Quadra 6, Lote 88) |
| 811,11m² | 1 lote | Comercial (Quadra 6, Lote 87) |

---

## 3. TABELA DE PREÇOS — JUNHO 2026

### 3.1 Preço por m² por segmento

| Segmento | Valor por m² | Lotes aplicáveis |
|---|---|---|
| Residencial padrão (250m²) | R$ 1.220,00/m² | Quadras 3 |
| Residencial médio (360m²) | R$ 1.198,00/m² | Quadras 5 e 8 |
| Residencial grande (600m²+) | R$ 1.400,00/m² | Quadra 6 (lotes 89–97) |
| Residencial premium (Quadras 9–10) | R$ 1.450,00/m² | Quadras 9 e 10 |
| Comercial | R$ 1.580,00/m² | Quadras 1, 2, 6 (LC) |

### 3.2 Exemplos de preços reais (lotes disponíveis)

| Quadra | Lote | Metragem | Tipo | Preço Total |
|---|---|---|---|---|
| 1 | 4 | 360m² | Comercial | R$ 568.800,00 |
| 1 | 5 | 360m² | Comercial | R$ 568.800,00 |
| 1 | 8 | 397,50m² | Comercial | R$ 628.050,00 |
| 1 | 9 | 397,50m² | Comercial | R$ 628.050,00 |
| 2 | 16 | 360,21m² | Comercial | R$ 569.131,80 |
| 2 | 17 | 360,08m² | Comercial | R$ 568.926,40 |
| 2 | 18 | 360m² | Comercial | R$ 568.800,00 |
| 3 | 25 | 250m² | Residencial | R$ 305.000,00 |
| 3 | 27 | 250m² | Residencial | R$ 305.000,00 |
| 3 | 33 | 360,13m² | Residencial | R$ 439.358,60 |
| 3 | 34 | 452,15m² | Residencial | R$ 551.623,00 |
| 5 | 74 | 363,80m² | Residencial | R$ 435.832,40 |
| 5 | 79 | 450,02m² | Residencial | R$ 539.123,96 |
| 6 | 88 | 643,97m² | Comercial | R$ 1.017.472,60 |
| 6 | 89 | 623,51m² | Residencial | R$ 872.914,00 |
| 6 | 90 | 625,20m² | Residencial | R$ 875.280,00 |
| 6 | 97 | 643,91m² | Residencial | R$ 901.474,00 |
| 8 | 125 | 360,17m² | Residencial | R$ 431.483,66 |
| 8 | 135 | 291,25m² | Residencial | R$ 348.917,50 |
| 9 | 145 | 450,24m² | Residencial | R$ 652.848,00 |
| 9 | 146 | 360m² | Residencial | R$ 522.000,00 |
| 10 | 157 | 360m² | Residencial | R$ 522.000,00 |
| 10 | 163 | 462,15m² | Residencial | R$ 670.117,50 |

### 3.3 Exemplo real de parcelamento (Lote 25 — vendido como referência)
- Lote: Quadra 3, Lote 25 — 250m² — Residencial
- Valor total: R$ 305.000,00
- Entrada (10%): R$ 30.500,00 via Pix
- Parcelamento: 180 parcelas mensais de R$ 2.877,80
- **Este é o exemplo de como funciona o parcelamento direto com o incorporador**

---

## 4. CONDIÇÕES COMERCIAIS

### 4.1 Formas de pagamento confirmadas

| Modalidade | Disponível | Detalhe |
|---|---|---|
| Entrada (sinal) | Sim | Pix, TED ou Boleto |
| Parcelamento direto com incorporador | Sim | Até 180 parcelas mensais |
| À vista | Sim | Consultar desconto |
| Financiamento bancário | [PREENCHER] | Confirmar com Fernando |
| FGTS | [PREENCHER] | Confirmar com Fernando |

### 4.2 Documentação necessária para proposta
Conforme Proposta de Compra e Cadastro oficial:
- Nome completo, CPF, RG
- Data de nascimento, nacionalidade, estado civil
- Profissão e renda mensal estimada
- E-mail e WhatsApp
- Endereço completo
- RG, CPF, Comprovante de Residência e Estado Civil (envio posterior)

### 4.3 Importante — LGPD
O cliente autoriza o uso de seus dados para análise de crédito e confecção do contrato. A proposta não garante reserva até aprovação e confirmação do sinal.

---

## 5. INFRAESTRUTURA DO EMPREENDIMENTO

### 5.1 O que o projeto inclui (conforme Memorial Descritivo)

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

### 5.2 Sistema viário
- Avenida principal: 18m de largura (a partir da rodovia)
- Ruas locais internas: 13m de largura
- Vias com continuidade com o loteamento vizinho

### 5.3 Esgotamento sanitário
- Sistema individual por fossa séptica com filtro e sumidouro ou biodigestor
- Padrão exigido pela Prefeitura de Paraty + Águas de Paraty
- Construção fica a cargo do proprietário do lote no início da edificação

### 5.4 Áreas verdes e preservação
- 5 áreas verdes totalizando 8.399,64m²
- Faixa marginal de proteção: 16.612,72m² ao longo do Rio Perequê-açu
- Área de preservação estágio médio: 12.579,50m²
- Acesso à mata existente no morro integrado às áreas verdes

---

## 6. DIFERENCIAIS E ARGUMENTOS DE VENDA

### 6.1 Localização
- A 9 minutos do Centro Histórico de Paraty pela Rod. Paraty-Cunha (RJ 165)
- Acesso direto pela rodovia estadual asfaltada
- Entre a Serra do Mar e o Rio Perequê-açu
- Próximo a cachoeiras, trilhas e mirantes da Serra da Bocaina
- Paraty: Patrimônio Mundial UNESCO desde 2019 (junto com Serra da Bocaina)

### 6.2 O empreendimento
- Projeto aprovado pela Prefeitura Municipal de Paraty (processo 3763/2021)
- 163 lotes de 150m² a 811m² — variedade para todos os perfis
- Infraestrutura completa entregue pelo incorporador
- Áreas verdes preservadas e integradas ao projeto
- Faixa de preservação do Rio Perequê-açu garante natureza permanente
- Lotes planos e regulares — fáceis de construir

### 6.3 Investimento
- Paraty é destino consolidado de ecoturismo e turismo histórico
- Limitação natural de expansão urbana (APP + Mata Atlântica) valoriza os lotes disponíveis
- Parcelamento direto até 180 meses — sem banco, sem burocracia
- Exemplo: lote de 250m² por ~R$2.877/mês — valor de um aluguel médio

### 6.4 Respostas às objeções mais comuns

| Objeção | Resposta |
|---|---|
| "Paraty é longe" | Fica a 4h de SP e 4h30 do Rio pela BR-101. É o destino mais procurado da Costa Verde. |
| "Prefiro comprar na praia" | Lotes de frente de mar em Paraty custam 3x mais. Aqui você compra qualidade de vida a 9 minutos da orla, com lote maior pelo mesmo preço. |
| "O lote não tem casa" | Você constrói do seu jeito, no seu tempo. Muitos clientes compram hoje e constroem em 2–3 anos. O lote já valoriza enquanto isso. |
| "Paraty é tombada, não posso construir" | O tombamento é do Centro Histórico, não da cidade toda. Este loteamento tem projeto aprovado pela prefeitura — você constrói livremente dentro das regras do loteamento. |
| "E o esgoto?" | Sistema individual por fossa séptica/biodigestor — padrão da região, simples e aprovado pela prefeitura e pela Águas de Paraty. |
| "Tem área verde?" | Sim — 5 áreas verdes dentro do loteamento + faixa de preservação do Rio Perequê-açu. Natureza garantida por lei. |
| "Quanto tempo para escritura?" | [PREENCHER — confirmar com Fernando] |
| "Aceita FGTS/financiamento?" | [PREENCHER — confirmar com Fernando] |

---

## 7. ROTEIRO DE QUALIFICAÇÃO DO AGENTE

O agente deve coletar estas informações de cada lead, nessa ordem:

1. **Nome** — "Como posso te chamar?"
2. **Cidade** — para calibrar distância e logística da visita
3. **Objetivo** — moradia própria, investimento, casa de temporada, ou combinação?
4. **Metragem** — lotes menores (150–250m²), médios (360m²) ou grandes (450m²+)?
5. **Tipo** — residencial ou comercial?
6. **Forma de pagamento** — à vista, parcelamento direto (até 180x) ou financiamento bancário?
7. **Prazo de decisão** — imediato, 3 meses, 6 meses, mais de 1 ano?
8. **Como conheceu** — Instagram, indicação, site, tráfego pago?

**Após qualificação completa:** propor agendamento de visita presencial.

---

## 8. SCRIPT DE AGENDAMENTO DE VISITA

Quando o lead demonstrar interesse real (respondeu 5+ perguntas):

> "Ótimo, [NOME]! Com base no que você me contou, tenho lotes que combinam exatamente com o que você busca. A melhor forma de sentir o potencial do Moradas de Paraty é uma visita — você vê a localização, a infraestrutura e escolhe o lote com calma, sem compromisso. Quando você teria disponibilidade? Temos horários [PREENCHER — dias/horários que Fernando atende]."

**Quando lead mencionar o Lote 25 (referência de venda real):**
> "Temos um exemplo perfeito de como funciona: um lote de 250m² por R$305.000 — com entrada de R$30.500 e 180 parcelas de R$2.877. É o valor de um aluguel médio, mas você está construindo patrimônio em Paraty."

---

## 9. REGRAS DO AGENTE

### O agente SEMPRE:
- Responde em português brasileiro, tom cordial e profissional
- Foca em agendar a visita como objetivo final
- Registra todas as informações do lead automaticamente no CRM
- Usa os preços e dados exatos desta base de conhecimento
- Transfere para humano quando lead: pede falar com pessoa, demonstra intenção imediata de compra, faz proposta de valor, ou digita palavras-chave de transferência
- Silencia imediatamente quando vendedor assumir o atendimento (flag humano_ativo)

### O agente NUNCA:
- Inventa valores, condições ou disponibilidade de lotes
- Confirma disponibilidade de lote específico sem consultar o banco em tempo real
- Responde após takeover humano ativo
- Promete prazo de escritura ou documentação sem dado confirmado
- Discute política, religião ou temas não relacionados ao empreendimento

---

## 10. CHECKLIST FINAL — PENDÊNCIAS ANTES DO GO-LIVE

- [ ] Confirmar aceite de FGTS e financiamento bancário (sim/não e condições)
- [ ] Confirmar prazo para escritura após sinal
- [ ] Definir horários de visita disponíveis (dias/horários que Fernando atende)
- [ ] Confirmar desconto para pagamento à vista
- [ ] Atualizar status atual dos lotes (disponível/reservado/vendido) no banco de dados
- [ ] Inserir este documento na tabela configuracoes (chave: rag_conhecimento)
$rag$
)
on conflict (chave) do update set valor = excluded.valor;
