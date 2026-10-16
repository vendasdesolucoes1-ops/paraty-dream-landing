-- Consentimento registrado no formulário (auditoria R-11, issue #26).
--
-- Antes o aviso do formulário não era gravado em lugar nenhum: sem prova de
-- consentimento, o contato ativo (primeiro contato, follow-up) ficava sem base.
-- Agora cada envio do formulário grava QUAL texto a pessoa aceitou.

create table if not exists public.consentimentos (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  finalidade    text not null,
  texto_versao  text not null,
  origem        text not null default 'formulario_site',
  criado_em     timestamptz not null default now()
);

create index if not exists consentimentos_lead_idx on public.consentimentos (lead_id, criado_em desc);

alter table public.consentimentos enable row level security;

drop policy if exists "consentimentos_select_por_lead" on public.consentimentos;
create policy "consentimentos_select_por_lead" on public.consentimentos
  for select to authenticated using (public.pode_ver_lead(lead_id));

drop policy if exists "service_role_all_consentimentos" on public.consentimentos;
create policy "service_role_all_consentimentos" on public.consentimentos
  for all to service_role using (true) with check (true);

grant select on public.consentimentos to authenticated;

-- Nova assinatura com a versão do texto aceito. A antiga (6 argumentos)
-- continua existindo para a janela de deploy em que o site publicado ainda
-- não manda a versão; pode ser removida depois.
create or replace function public.upsert_lead_from_form(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cidade text,
  p_metragem_interesse numeric,
  p_tipo_lote_interesse text,
  p_consentimento_versao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_consentimento_versao is null or length(trim(p_consentimento_versao)) = 0 then
    raise exception 'Consentimento obrigatório.' using errcode = '22023';
  end if;

  v_id := public.upsert_lead_from_form(
    p_nome, p_email, p_telefone, p_cidade, p_metragem_interesse, p_tipo_lote_interesse
  );

  insert into public.consentimentos (lead_id, finalidade, texto_versao)
  values (v_id, 'contato_whatsapp_e_atendimento_assistido', left(p_consentimento_versao, 40));

  return v_id;
end;
$$;

grant execute on function public.upsert_lead_from_form(text, text, text, text, numeric, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
