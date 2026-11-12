-- Visita marcada nunca fica sem vendedor.
--
-- A Sophia (e o painel) gravam a visita com o vendedor do lead; sem ele, com o
-- vínculo de vendedor do consultor responsável. Com o rodízio desligado e o
-- consultor sem vínculo, a visita nascia sem ninguém: o lead aparecia
-- "Agendado" e "Sem vendedor" e nenhum corretor era avisado (casos de 11 a
-- 16/11/2026).
--
-- Agora, ao criar uma visita para um lead sem vendedor, o banco escolhe um na
-- hora: o próximo do rodízio (se estiver ligado) ou o vendedor do consultor
-- responsável. O lead passa a ser dele, o que dispara o aviso por WhatsApp
-- (leads_avisar_vendedor) e entra no histórico do rodízio. Sem rodízio e sem
-- consultor ligado a um vendedor, nada muda (e a gestão continua vendo o lead
-- em "Sem vendedor").

create or replace function public.visita_garantir_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_vend uuid;
  v_nome text;
  v_consultor jsonb;
begin
  select id, vendedor_id into v_lead from public.leads where id = new.lead_id;
  if v_lead.id is null then
    return new;
  end if;

  -- Lead já tem dono: a visita é dele.
  if v_lead.vendedor_id is not null then
    new.vendedor_id := coalesce(new.vendedor_id, v_lead.vendedor_id);
    return new;
  end if;

  v_vend := new.vendedor_id;

  if v_vend is null then
    v_vend := public.get_next_round_robin_salesperson();
  end if;

  if v_vend is null then
    begin
      select valor::jsonb into v_consultor from public.configuracoes where chave = 'consultor_responsavel';
    exception when others then
      v_consultor := null;
    end;
    if v_consultor ? 'vendedor_id' and nullif(v_consultor ->> 'vendedor_id', '') is not null then
      select id into v_vend from public.vendedores
       where id = (v_consultor ->> 'vendedor_id')::uuid and ativo;
    end if;
  end if;

  if v_vend is null then
    return new;
  end if;

  new.vendedor_id := v_vend;
  update public.leads set vendedor_id = v_vend where id = new.lead_id and vendedor_id is null;
  select nome into v_nome from public.vendedores where id = v_vend;
  insert into public.interacoes (lead_id, tipo, canal, conteudo)
  values (new.lead_id, 'sistema', 'atribuicao',
          'Visita marcada para um lead sem vendedor: entregue a ' || coalesce(v_nome, 'um vendedor')
          || ' para receber a visita.');
  return new;
end;
$$;

revoke all on function public.visita_garantir_vendedor() from public, anon, authenticated;

drop trigger if exists visita_garantir_vendedor on public.visitas;
create trigger visita_garantir_vendedor
  before insert on public.visitas
  for each row execute function public.visita_garantir_vendedor();
