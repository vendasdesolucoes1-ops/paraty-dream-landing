-- Canal por onde o lead conheceu o empreendimento (Instagram, indicação,
-- Google, site, tráfego pago...).
--
-- Coluna nova, e não reaproveitamento de `leads.origem`: aquela responde "por
-- onde o lead entrou no sistema" e o whatsapp-webhook grava 'whatsapp' em todo
-- lead que chega por lá. Escrever o canal ali destruiria esse dado — são duas
-- perguntas diferentes sobre o mesmo lead.

alter table leads add column if not exists canal_origem text;

-- Sem CHECK de propósito. O vocabulário é aberto ("vi um story", "amigo meu
-- comprou", "achei no Google") e uma lista fixa rejeitaria resposta legítima.
-- Pior: um valor fora da lista derruba o UPDATE inteiro e leva junto os outros
-- campos extraídos na mesma operação — risco que já contornamos com um guard
-- em código no caso de `objetivo`. A normalização fica na extração.

comment on column leads.canal_origem is
  'Como o lead conheceu o empreendimento. Preenchido pela extração estruturada da conversa. Valores preferenciais: Instagram, Facebook, Google, site, indicação, tráfego pago, placa/outdoor, outro.';
