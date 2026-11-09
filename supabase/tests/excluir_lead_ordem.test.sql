-- Exclusão definitiva de lead com conversa no WhatsApp (falhava com 23503).
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_lead uuid;
  v_outro uuid;
  v_contato uuid;
  v_contato2 uuid;
  r jsonb;
  n int;
begin
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Exclusão Teste', '5512991519515', 'whatsapp', 'novo') returning id into v_lead;
  -- Outro lead, de outro número, não pode ser afetado.
  insert into public.leads (nome, telefone, origem, status_crm)
  values ('Fica', '5524988887777', 'whatsapp', 'novo') returning id into v_outro;

  -- Contato do número (sem o 9, como o WhatsApp às vezes manda) e um contato
  -- ligado ao lead por lead_id, com outro número.
  insert into public.whatsapp_contacts (phone, name, lead_id)
  values ('551291519515', 'Contato', null) returning id into v_contato;
  insert into public.whatsapp_contacts (phone, name, lead_id)
  values ('5511900000001', 'Outro aparelho', v_lead) returning id into v_contato2;

  insert into public.whatsapp_messages (lead_id, contact_id, remote_jid, message_id, from_me, content, message_type)
  values (v_lead, v_contato, '551291519515@s.whatsapp.net', 'exc-1', false, 'Boa noite', 'text'),
         (null, v_contato2, '5511900000001@s.whatsapp.net', 'exc-2', false, 'oi', 'text'),
         (v_outro, null, '5524988887777@s.whatsapp.net', 'exc-3', false, 'fica', 'text');
  insert into public.interacoes (lead_id, tipo, canal, conteudo) values (v_lead, 'nota', 'sistema', 'x');

  r := public.excluir_lead_definitivo_impl(v_lead);

  assert not exists (select 1 from public.leads where id = v_lead), 'lead apagado';
  assert not exists (select 1 from public.whatsapp_contacts where id in (v_contato, v_contato2)), 'contatos apagados';
  select count(*) into n from public.whatsapp_messages where message_id in ('exc-1', 'exc-2');
  assert n = 0, 'mensagens do lead e dos contatos dele apagadas';
  assert exists (select 1 from public.leads where id = v_outro), 'outro lead intacto';
  assert exists (select 1 from public.whatsapp_messages where message_id = 'exc-3'), 'mensagem de outro lead intacta';
  assert (r ->> 'whatsapp_messages')::int = 2 and (r ->> 'contatos')::int = 2, 'contagem devolvida';
end $$;
rollback;
