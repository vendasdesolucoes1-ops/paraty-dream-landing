-- Mais opções do agente no painel (Configurações → Agente IA).
--
--   temperatura             criatividade das respostas (nulo = padrão do código, 0.4)
--   instrucoes_extras       orientações da equipe, anexadas ao prompt por fora da
--                           base; não revogam as regras fixas (preço, opt-out, visita)
--   mensagem_transferencia  o que a Sophia diz ao passar para um humano por
--                           palavra-chave (nulo = texto padrão; "||" separa bolhas)

alter table public.ai_agents
  add column if not exists temperatura numeric(3,2)
    check (temperatura is null or (temperatura >= 0 and temperatura <= 1)),
  add column if not exists instrucoes_extras text
    check (instrucoes_extras is null or length(instrucoes_extras) <= 2000),
  add column if not exists mensagem_transferencia text
    check (mensagem_transferencia is null or length(mensagem_transferencia) <= 500);

notify pgrst, 'reload schema';
