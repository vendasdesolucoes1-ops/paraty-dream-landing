-- Exclusão real de lead, em transação, respeitando a ordem das FKs.
--
-- Por que RPC e não lógica no cliente:
--
-- 1. Atomicidade. Uma função PL/pgSQL é uma transação: ou os 8 passos
--    acontecem, ou nenhum. Oito chamadas PostgREST separadas podem falhar no
--    meio e deixar mensagens órfãs apontando para um lead que não existe mais.
-- 2. RLS. whatsapp_messages e as tabelas ai_agent_* só têm policy de
--    service_role. Um DELETE vindo do cliente autenticado NÃO dá erro — o RLS
--    filtra as linhas e o comando afeta zero linhas, retornando sucesso. O
--    painel mostraria "excluído" com tudo intacto no banco.
--
-- Substitui o soft delete (UPDATE deletado_em), que era um contorno para as
-- FKs NO ACTION e já causou bug em produção: lead com deletado_em sumia do CRM
-- mas continuava sendo encontrado pela busca por telefone da enrich-lead, que
-- não filtrava a coluna. Exclusão real elimina essa classe de bug — e é o que
-- a LGPD exige num pedido de remoção de dados.
--
-- A coluna deletado_em continua existindo e não é removida aqui: outras partes
-- do sistema ainda a filtram. Ela apenas deixa de ser preenchida por este
-- caminho.

create or replace function public.excluir_lead_definitivo(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone   text;
  v_sufixo     text;
  v_clientes   int;
  v_agendadas  int := 0;
  v_takeovers  int := 0;
  v_conversas  int := 0;
  v_mensagens  int := 0;
  v_contatos   int := 0;
  v_interacoes int := 0;
  v_visitas    int := 0;
begin
  -- SECURITY DEFINER ignora RLS: sem esta checagem a função seria um endpoint
  -- de exclusão em massa aberto a qualquer usuário autenticado.
  if public.get_my_role() not in ('admin', 'gestor') then
    raise exception 'Sem permissão para excluir leads.'
      using errcode = '42501';
  end if;

  select telefone into v_telefone
    from public.leads
   where id = p_lead_id;

  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  -- Guarda de negócio: quem já comprou não pode ter a origem apagada por
  -- engano. O FK é ON DELETE SET NULL, então o comprador sobreviveria — mas
  -- perderia para sempre o vínculo com a venda, sem como recuperar.
  select count(*) into v_clientes
    from public.clientes
   where lead_id = p_lead_id;

  if v_clientes > 0 then
    raise exception 'Este lead já é um cliente comprador e não pode ser excluído. Remova o vínculo em Clientes antes de tentar de novo.'
      using errcode = 'P0001';
  end if;

  -- 1. Fila de mensagens. O FK já é ON DELETE CASCADE, então este delete é
  -- redundante — fica explícito para a ordem documentar a intenção e não
  -- depender de o CASCADE continuar existindo.
  delete from public.mensagens_agendadas where lead_id = p_lead_id;
  get diagnostics v_agendadas = row_count;

  -- 2 e 3. ai_agent_* não têm lead_id: o vínculo é o telefone gravado em
  -- ai_agent_conversations.session_id.
  --
  -- Casamento por SUFIXO, não igualdade: session_id guarda o telefone com DDI
  -- (5512...) e não há garantia de que leads.telefone esteja sempre no mesmo
  -- formato. O sufixo de 10+ dígitos (DDD + número) é o que as duas pontas têm
  -- em comum. Telefone nulo ou curto demais pula estes dois passos — apagar
  -- takeover alheio é pior do que deixar um órfão.
  v_sufixo := right(regexp_replace(coalesce(v_telefone, ''), '\D', '', 'g'), 10);

  if length(v_sufixo) = 10 then
    delete from public.ai_agent_human_takeover t
     where t.conversation_id in (
       select c.id from public.ai_agent_conversations c
        where c.session_id like '%' || v_sufixo
     );
    get diagnostics v_takeovers = row_count;

    delete from public.ai_agent_conversations c
     where c.session_id like '%' || v_sufixo;
    get diagnostics v_conversas = row_count;
  end if;

  -- 4. Histórico de WhatsApp.
  delete from public.whatsapp_messages where lead_id = p_lead_id;
  get diagnostics v_mensagens = row_count;

  -- 5. O contato NÃO é apagado: ele é da agenda do número, não do lead. Só
  -- perde o vínculo.
  update public.whatsapp_contacts set lead_id = null where lead_id = p_lead_id;
  get diagnostics v_contatos = row_count;

  -- 6 e 7.
  delete from public.interacoes where lead_id = p_lead_id;
  get diagnostics v_interacoes = row_count;

  delete from public.visitas where lead_id = p_lead_id;
  get diagnostics v_visitas = row_count;

  -- 8. Por último, o lead. documentos e disparos_log são ON DELETE SET NULL:
  -- as linhas sobrevivem sem o vínculo, por decisão — apagar a linha de
  -- documentos sem apagar o arquivo no Storage deixaria lixo pior.
  delete from public.leads where id = p_lead_id;

  return jsonb_build_object(
    'mensagens_agendadas', v_agendadas,
    'takeovers',           v_takeovers,
    'conversas',           v_conversas,
    'whatsapp_messages',   v_mensagens,
    'contatos_desvinculados', v_contatos,
    'interacoes',          v_interacoes,
    'visitas',             v_visitas
  );
end;
$$;

comment on function public.excluir_lead_definitivo(uuid) is
  'Exclusão real de lead em transação, na ordem das FKs. Admin/gestor apenas. Bloqueia se houver cliente comprador vinculado.';

revoke all on function public.excluir_lead_definitivo(uuid) from public, anon;
grant execute on function public.excluir_lead_definitivo(uuid) to authenticated;

-- Sem isso o PostgREST devolve 404 na primeira chamada, como já aconteceu
-- com o upsert_lead_from_form.
notify pgrst, 'reload schema';
