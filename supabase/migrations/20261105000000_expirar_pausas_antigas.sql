-- Pausas por atendimento humano criadas antes da expiração existir.
--
-- Até 04/11 a pausa da IA numa conversa não tinha prazo: ficava aberta até
-- alguém "devolver para a IA" no painel, o que quase nunca acontecia. A regra
-- nova (20261104000100_sophia_correcoes) considera aberta a pausa sem
-- `expira_em`, então essas conversas antigas ficariam mudas para sempre quando
-- a Sophia fosse ligada (eram 76 em 08/11/2026).
--
-- Aqui elas ganham o mesmo prazo das pausas novas (`pausa_humana_horas`,
-- padrão 24 h) contado a partir de quando foram abertas: as antigas já nascem
-- vencidas e a conversa volta para a IA na próxima mensagem do lead. Nada é
-- apagado; o histórico de quem assumiu continua na tabela.

update public.ai_agent_human_takeover t
   set expira_em = t.human_takeover_at
                   + make_interval(hours => coalesce(
                       (select nullif(trim(valor), '')::int
                          from public.configuracoes
                         where chave = 'pausa_humana_horas'
                           and trim(valor) ~ '^\d+$'),
                       24)),
       origem = coalesce(t.origem, 'legado')
 where t.resolved_at is null
   and t.expira_em is null;
