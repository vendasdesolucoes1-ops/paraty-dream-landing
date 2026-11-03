-- Correções pós-auditoria: entradas/origens, score, origem preservada,
-- carteira devolvida, preço só para a gestão, opt-out firme.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  v_lead uuid;
  v_g uuid := '00000000-0000-0000-0000-00000000d0a1';
  v_v uuid := '00000000-0000-0000-0000-00000000d0a2';
  v_vend uuid;
  r jsonb;
  n int;
begin
  insert into auth.users (id, email) values (v_g, 'g@pa.local'), (v_v, 'v@pa.local');
  insert into public.profiles (id, email, nome, role, ativo) values
    (v_g, 'g@pa.local', 'G', 'gestor', true),
    (v_v, 'v@pa.local', 'Vera', 'vendedor', true)
  on conflict (id) do update set role = excluded.role, ativo = true;
  select vendedor_id into v_vend from public.profiles where id = v_v;
  assert v_vend is not null, 'perfil Vendedor ganha cadastro de vendedor';

  -- Lead do WhatsApp que depois preenche o formulário.
  insert into public.leads (nome, telefone, origem, created_at, vendedor_id)
  values ('Rita', '5524999981111', 'whatsapp', now() - interval '10 days', v_vend)
  returning id into v_lead;
  r := public.registrar_lead_formulario(jsonb_build_object(
    'leadgen_id', 'pa1', 'nome', 'Rita', 'telefone', '5524999981111', 'campanha_nome', 'Camp',
    'prazo_compra', 'Nos próximos 3 meses', 'quer_visitar', 'Sim, quero visitar', 'notificar', false));
  assert (r->>'lead_id')::uuid = v_lead, 'mesmo lead';
  insert into public.meta_leads_formulario (leadgen_id, status, lead_id, campanha_nome, criado_meta_em, origem)
  values ('pa1', 'gravado', v_lead, 'Camp', now(), 'webhook')
  on conflict (leadgen_id) do update set status = 'gravado', lead_id = excluded.lead_id;

  perform 1 from public.leads
   where id = v_lead and origem_primeira = 'whatsapp' and origem_ultima = 'formulario_meta'
     and 'formulario_meta' = any (canais_entrada) and origem = 'whatsapp';
  assert found, 'primeira WhatsApp, última Formulário, origem gravada intacta';
  assert (select score from public.leads where id = v_lead) = 4, 'score: 3 meses (+2) e quer visitar (+2)';

  -- Resposta no WhatsApp: +1, uma vez só.
  insert into public.whatsapp_messages (lead_id, from_me, content, message_id, remote_jid)
  values (v_lead, false, 'oi', 'pa-m1', 'x'), (v_lead, false, 'oi de novo', 'pa-m2', 'x');
  assert (select score from public.leads where id = v_lead) = 5, 'respondeu (+1)';

  -- Salvar a ficha sem os campos da Meta não apaga nada; origem automática não muda pela tela.
  update public.leads set campanha_nome = null, origem = null where id = v_lead;
  assert (select campanha_nome from public.leads where id = v_lead) = 'Camp', 'campanha preservada';
  assert (select origem from public.leads where id = v_lead) = 'whatsapp', 'origem preservada';

  -- Sair só do rodízio não mexe na carteira.
  update public.vendedores set no_rodizio = false where id = v_vend;
  assert (select vendedor_id from public.leads where id = v_lead) = v_vend, 'carteira mantida';

  -- Vendedor desativado: carteira volta para Sem vendedor, com histórico.
  update public.vendedores set ativo = false where id = v_vend;
  assert (select vendedor_id from public.leads where id = v_lead) is null, 'devolvido';
  select count(*) into n from public.interacoes where lead_id = v_lead and conteudo like 'Devolvido: vendedor inativo%';
  assert n = 1, 'histórico da devolução';

  -- Rodízio pula vendedor sem telefone.
  update public.vendedores set ativo = false;
  update public.vendedores set ativo = true, no_rodizio = true, telefone = null where id = v_vend;
  assert public.proximo_vendedor_da_fila() is null, 'sem telefone fica fora da fila';

  -- Preço: vendedor não lê lotes.valor; a view devolve null para ele.
  assert not has_column_privilege('authenticated', 'public.lotes', 'valor', 'select'), 'coluna valor fechada';
  assert has_column_privilege('authenticated', 'public.lotes', 'status', 'select'), 'disponibilidade aberta';

  -- Nutrição é etapa válida.
  update public.leads set status_crm = 'nutricao' where id = v_lead;

  -- Opt-out: service_role (Edge Function) não desfaz; "sem interesse" bloqueia envio.
  update public.leads set sem_interesse_em = now() where id = v_lead;
  assert (select contato_bloqueado from public.leads where id = v_lead), 'sem interesse bloqueia';
  set local role service_role;
  begin
    update public.leads set contato_bloqueado = false where id = v_lead;
    assert false, 'service_role não deveria desbloquear';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
