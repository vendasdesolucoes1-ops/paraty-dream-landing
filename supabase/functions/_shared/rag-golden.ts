// Conjunto de avaliação da busca (golden set).
//
// Cada pergunta traz palavras que DEVEM aparecer em algum dos trechos
// recuperados — se a busca não as traz, a Sophia não tem como responder.
// Rodar: POST rag-admin {"action":"avaliar"} (ver docs/rag.md).
//
// Escrito contra a base v3.0. Ao mudar a base de forma relevante, ajuste as
// palavras esperadas: o teste mede se a busca acha a informação, não se a
// informação continua igual.
//
// `fora` são mensagens que NÃO têm resposta na base (conversa solta, assunto
// alheio). Servem para calibrar o piso de similaridade: o melhor trecho
// delas tem de ficar abaixo do pior acerto das perguntas reais.

export interface CasoOuro {
  pergunta: string;
  /** Basta UM destes aparecer (sem diferenciar maiúsculas nem acentos) nos trechos recuperados. */
  contem: string[];
}

export const PERGUNTAS_OURO: CasoOuro[] = [
  // Identidade
  { pergunta: "Onde fica o loteamento?", contem: ["Bananal", "RJ 165"] },
  { pergunta: "Qual é o CEP?", contem: ["23.970-000"] },
  { pergunta: "Qual o CNPJ da empresa dona do loteamento?", contem: ["37.489.760"] },
  { pergunta: "Em que zona de uso o terreno se enquadra?", contem: ["ZOR-02"] },
  { pergunta: "Quem é o arquiteto responsável pelo projeto?", contem: ["Marco Antonio"] },
  { pergunta: "O projeto é aprovado pela prefeitura?", contem: ["3763/2021"] },

  // Estrutura
  { pergunta: "Quantos lotes tem no total?", contem: ["163 lotes"] },
  { pergunta: "Quantos lotes são comerciais?", contem: ["21 lotes"] },
  { pergunta: "Qual o tamanho da área total do terreno?", contem: ["118.574"] },
  { pergunta: "Quais quadras são comerciais?", contem: ["Comercial (LC)"] },
  { pergunta: "Que tamanhos de lote existem no projeto?", contem: ["169,07", "153,15"] },
  { pergunta: "Tem lote grande, acima de 450 metros?", contem: ["450m²+", "360–811"] },

  // Infraestrutura
  { pergunta: "Como funciona o esgoto?", contem: ["fossa séptica"] },
  { pergunta: "A rua é asfaltada?", contem: ["asfalto", "Pavimentação asfáltica"] },
  { pergunta: "Qual a largura das ruas?", contem: ["18m", "13m"] },
  { pergunta: "Tem iluminação pública e rede elétrica?", contem: ["iluminação"] },
  { pergunta: "Tem água encanada?", contem: ["Abastecimento de água", "asfalto, água"] },
  { pergunta: "Quanto tempo leva a terraplanagem?", contem: ["3 meses"] },
  { pergunta: "Tem área verde no loteamento?", contem: ["5 áreas verdes"] },
  { pergunta: "Tem rio por perto?", contem: ["Perequê-açu"] },

  // Diferenciais e objeções
  { pergunta: "Quantos minutos até o centro histórico?", contem: ["9 minutos"] },
  { pergunta: "Tem cachoeira por perto?", contem: ["cachoeiras"] },
  { pergunta: "Paraty é muito longe de São Paulo?", contem: ["4h de SP"] },
  { pergunta: "Tem academia ou playground?", contem: ["Playground", "Academia"] },
  { pergunta: "Posso levar meu cachorro, tem espaço pet?", contem: ["Espaço Pet"] },
  { pergunta: "Tem árvore na frente do lote?", contem: ["Ipê"] },
  { pergunta: "É condomínio fechado?", contem: ["bairro planejado"] },
  {
    pergunta: "Dá para financiar direto com o loteador, sem banco?",
    contem: ["Financiamento direto", "financiamento direto"],
  },
  { pergunta: "Aceita FGTS?", contem: ["FGTS"] },
  { pergunta: "Paraty é tombada, consigo construir?", contem: ["tombamento"] },
  { pergunta: "Vale a pena como investimento?", contem: ["ecoturismo", "valoriza"] },
  { pergunta: "O lote já vem com a casa construída?", contem: ["constrói do seu jeito"] },
  { pergunta: "Quanto custa um lote?", contem: ["Valor eu prefiro passar"] },

  // Documentação
  {
    pergunta: "Quais documentos preciso para fazer a proposta?",
    contem: ["Comprovante de Residência"],
  },
  {
    pergunta: "Meus dados pessoais ficam protegidos? LGPD",
    contem: ["LGPD", "autoriza o uso de seus dados"],
  },
];

export const PERGUNTAS_FORA: string[] = [
  "Oi, tudo bem?",
  "Obrigado!",
  "Vou pensar e te falo",
  "Qual a capital da França?",
  "Me indica um restaurante bom no Rio?",
];
