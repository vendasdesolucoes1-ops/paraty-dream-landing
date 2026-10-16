-- Telefone canônico (auditoria R-19, issue #38).
--
-- O mesmo celular aparecia com e sem o 9, com e sem DDI e com máscara; o
-- casamento por "10 últimos dígitos" separava os formatos e fazia DDDs
-- diferentes colidirem. Resultado: lead duplicado com dois vendedores, e
-- opt-out e takeover que não encontravam o lead certo.
--
-- Chave: "55" + DDD + os 8 últimos dígitos (o 9 de celular sai). Mesma regra
-- de chaveTelefone() em src/lib/utils.ts e _shared/contato-bloqueado.ts.

create or replace function public.telefone_chave(p_telefone text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  d text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if length(d) in (12, 13) and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  if length(d) = 11 and substr(d, 3, 1) = '9' then
    d := substr(d, 1, 2) || substr(d, 4);
  end if;
  if length(d) <> 10 then
    return null;
  end if;
  return '55' || d;
end;
$$;

alter table public.leads
  add column if not exists telefone_chave text
  generated always as (public.telefone_chave(telefone)) stored;

create index if not exists leads_telefone_chave_idx on public.leads (telefone_chave);

-- Duplicatas pela chave canônica, para a fusão assistida. Quando esta visão
-- estiver vazia, dá para criar o índice único:
--   create unique index leads_telefone_chave_unico
--     on public.leads (telefone_chave) where telefone_chave is not null and deletado_em is null;
create or replace view public.leads_telefone_duplicado
with (security_invoker = true) as
select telefone_chave,
       count(*)                                   as quantidade,
       array_agg(id order by created_at)          as lead_ids,
       array_agg(distinct vendedor_id)            as vendedores
  from public.leads
 where telefone_chave is not null
   and deletado_em is null
 group by telefone_chave
having count(*) > 1;

grant select on public.leads_telefone_duplicado to authenticated;
