-- Exclusão definitiva de lead falhava com 409 para quase todo lead.
--
-- excluir_lead_definitivo_impl apagava os contatos do WhatsApp do número ANTES
-- das mensagens do lead, e whatsapp_messages.contact_id aponta para o contato
-- sem cascata: o banco recusava (23503) sempre que o lead tinha conversa. Um
-- contato ligado ao lead por lead_id, mas com outro número, também travava a
-- exclusão do lead no final.
--
-- Agora: mensagens primeiro (as do lead e as que apontam para os contatos dele),
-- depois os contatos (pelo número ou pelo vínculo com o lead). O resto é igual.

create or replace function public.excluir_lead_definitivo_impl(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
  v_chave    text;
  v_contagem jsonb := '{}'::jsonb;
  n          int;
begin
  select telefone into v_telefone from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.clientes where lead_id = p_lead_id) then
    raise exception 'Este lead já é um cliente comprador e não pode ser excluído. Remova o vínculo em Clientes antes de tentar de novo.'
      using errcode = 'P0001';
  end if;

  v_chave := public.telefone_chave(v_telefone);

  delete from public.mensagens_agendadas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('mensagens_agendadas', n);

  -- Mensagens antes dos contatos: whatsapp_messages.contact_id não tem cascata.
  delete from public.whatsapp_messages m
   where m.lead_id = p_lead_id
      or m.contact_id in (
        select w.id from public.whatsapp_contacts w
         where w.lead_id = p_lead_id
            or (v_chave is not null and public.telefone_chave(w.phone) = v_chave)
      );
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('whatsapp_messages', n);

  -- Contato da agenda do número (ou ligado ao lead): some junto, é dado do titular.
  delete from public.whatsapp_contacts w
   where w.lead_id = p_lead_id
      or (v_chave is not null and public.telefone_chave(w.phone) = v_chave);
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('contatos', n);

  -- Conversas da IA pela chave canônica (DDD inteiro): nunca a de outro lead.
  if v_chave is not null then
    delete from public.ai_agent_human_takeover t
     where t.conversation_id in (
       select c.id from public.ai_agent_conversations c
        where public.telefone_chave(c.session_id) = v_chave
     );
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('takeovers', n);

    delete from public.ai_agent_conversations c where public.telefone_chave(c.session_id) = v_chave;
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('conversas', n);

    -- Itens de campanha guardam nome e telefone: anonimiza (a contagem da
    -- campanha continua valendo).
    update public.disparos_itens
       set nome = null, telefone = '[removido]', erro = null, lead_id = null
     where public.telefone_chave(telefone) = v_chave or lead_id = p_lead_id;
    get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('disparos_itens', n);
  end if;

  delete from public.rag_consultas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('rag_consultas', n);

  delete from public.notifications where link like '%lead=' || p_lead_id::text || '%';
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('notificacoes', n);

  delete from public.interacoes where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('interacoes', n);

  delete from public.visitas where lead_id = p_lead_id;
  get diagnostics n = row_count; v_contagem := v_contagem || jsonb_build_object('visitas', n);

  -- A trilha guarda que o registro existiu e foi apagado, sem o conteúdo.
  update public.auditoria
     set antes = null, depois = null, mudancas = null
   where tabela in ('leads', 'visitas') and registro_id = p_lead_id::text;

  delete from public.leads where id = p_lead_id;

  insert into public.auditoria (tabela, registro_id, operacao, autor_id, origem)
  values ('leads', p_lead_id::text, 'DELETE', auth.uid(), 'exclusao_titular');

  return v_contagem;
end;
$$;

revoke all on function public.excluir_lead_definitivo_impl(uuid) from public, anon, authenticated;
