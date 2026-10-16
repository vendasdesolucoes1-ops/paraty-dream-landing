-- Sinais da IA sobre as respostas de follow-up (issue #52).
--
-- Cada resposta de um lead em cadência é classificada (interessado, dúvida,
-- objeção, quer agendar, agora não, opt-out, fora de contexto e, com visita
-- agendada, confirma/reagendar/cancelar). A decisão continua determinística;
-- o sinal fica registrado com modelo e versão do prompt para auditoria e para
-- medir o acerto no piloto.

create table if not exists public.lead_sinais (
  id             bigserial primary key,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  inscricao_id   uuid references public.inscricoes(id) on delete set null,
  intencao       text not null check (intencao in (
                   'interessado', 'duvida', 'objecao', 'quer_agendar', 'agora_nao', 'opt_out',
                   'fora_de_contexto', 'confirma_visita', 'reagendar_visita', 'cancelar_visita')),
  confianca      numeric(3,2) not null check (confianca between 0 and 1),
  motivo         text,
  origem         text not null check (origem in ('modelo', 'palavra_chave')),
  modelo         text,
  versao_prompt  text not null,
  -- Revisão humana no piloto: a intenção correta, quando a IA errou.
  intencao_correta text,
  revisado_por   uuid,
  criado_em      timestamptz not null default now()
);

create index if not exists lead_sinais_lead_idx on public.lead_sinais (lead_id, criado_em desc);

alter table public.lead_sinais enable row level security;
drop policy if exists "lead_sinais_select" on public.lead_sinais;
create policy "lead_sinais_select" on public.lead_sinais
  for select to authenticated using (public.pode_ver_lead(lead_id));
-- Correção do piloto: só a coluna de revisão, só gestão.
drop policy if exists "lead_sinais_revisao_gestao" on public.lead_sinais;
create policy "lead_sinais_revisao_gestao" on public.lead_sinais
  for update to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
grant select on public.lead_sinais to authenticated;
grant update (intencao_correta, revisado_por) on public.lead_sinais to authenticated;

-- Acerto do classificador no piloto (sinais revisados por humano).
create or replace function public.acerto_classificador()
returns table (versao_prompt text, revisados bigint, acertos bigint, acerto_pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select s.versao_prompt, count(*), count(*) filter (where s.intencao_correta = s.intencao),
         round(100.0 * count(*) filter (where s.intencao_correta = s.intencao) / nullif(count(*), 0), 1)
    from public.lead_sinais s
   where s.intencao_correta is not null and s.origem = 'modelo'
   group by 1
   order by 1 desc;
end;
$$;
revoke all on function public.acerto_classificador() from public, anon;
grant execute on function public.acerto_classificador() to authenticated;

notify pgrst, 'reload schema';
