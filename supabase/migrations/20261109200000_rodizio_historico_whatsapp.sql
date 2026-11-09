-- Histórico de atribuições com a situação do WhatsApp ao vendedor.
--
-- O histórico mostrava só a hora da atribuição. Na tela parecia que o
-- vendedor tinha sido avisado, mas a mensagem podia ter saído horas depois
-- (ou nunca). Agora cada linha diz se o WhatsApp saiu e quando:
--
--   enviado      aviso de atribuição entregue à Evolution (avisos_vendedor)
--   resumo       resumo da qualificação da Sophia (substitui o aviso)
--   pendente     aviso na fila, sai em até ~1 min
--   erro         desistiu depois das tentativas
--   cancelado    não saiu, com o motivo (lead mudou de dono, etc.)
--   proprio      o vendedor pegou o lead para si: não há o que avisar
--   sem_telefone vendedor sem WhatsApp cadastrado
--   nao_enviado  nada saiu (atribuições anteriores ao aviso automático)
--
-- Remoções não têm WhatsApp: as colunas vêm nulas.

drop function if exists public.rodizio_historico(integer);

create function public.rodizio_historico(p_limite integer default 50)
returns table (
  id bigint, criado_em timestamptz, origem text,
  lead_id uuid, lead_nome text, vendedor_id uuid, vendedor_nome text, autor_nome text,
  whatsapp_situacao text, whatsapp_em timestamptz, whatsapp_motivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rodizio_exigir_gestao();
  return query
    select a.id, a.criado_em, a.origem, a.lead_id, l.nome, a.vendedor_id, v.nome, p.nome,
           case
             when a.origem = 'remocao' then null
             when av.status = 'enviado' then 'enviado'
             when rs.created_at is not null then 'resumo'
             when av.status in ('pendente', 'enviando') then 'pendente'
             when av.status = 'erro' then 'erro'
             when av.status = 'cancelado' then 'cancelado'
             when a.autor_id is not null and a.autor_id = v.profile_id then 'proprio'
             when nullif(btrim(coalesce(v.telefone, '')), '') is null then 'sem_telefone'
             else 'nao_enviado'
           end,
           case
             when a.origem = 'remocao' then null
             when av.status = 'enviado' then av.enviado_em
             when rs.created_at is not null then rs.created_at
             when av.status in ('pendente', 'enviando') then av.agendado_para
             when av.status in ('erro', 'cancelado') then av.atualizado_em
           end,
           case when a.origem <> 'remocao' and av.status in ('erro', 'cancelado') then av.erro end
      from public.rodizio_atribuicoes a
      join public.vendedores v on v.id = a.vendedor_id
      left join public.leads l on l.id = a.lead_id
      left join public.profiles p on p.id = a.autor_id
      -- O aviso deste lead para este vendedor (o mais recente).
      left join lateral (
        select x.status, x.enviado_em, x.agendado_para, x.atualizado_em, x.erro
          from public.avisos_vendedor x
         where x.lead_id = a.lead_id and x.vendedor_id = a.vendedor_id
         order by x.criado_em desc
         limit 1
      ) av on true
      -- O resumo da qualificação enviado ao vendedor depois desta atribuição.
      left join lateral (
        select i.created_at
          from public.interacoes i
         where i.lead_id = a.lead_id
           and i.canal = 'sistema'
           and i.conteudo like 'Resumo da qualificação enviado por WhatsApp para %'
           and i.created_at >= a.criado_em - interval '5 minutes'
         order by i.created_at
         limit 1
      ) rs on true
     -- Escolha da fila que ainda não virou lead (ou falhou) não é atribuição.
     where a.lead_id is not null
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;
revoke all on function public.rodizio_historico(integer) from public, anon;
grant execute on function public.rodizio_historico(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
