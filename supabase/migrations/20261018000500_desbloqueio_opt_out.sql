-- Desfazer um opt-out é exceção, não edição de cadastro (LGPD, art. 18).
--
-- Antes, qualquer usuário com permissão de editar o lead podia voltar
-- `contato_bloqueado` para false (ou limpar `sem_interesse_em`) por um update
-- comum. Agora só a RPC abaixo faz isso: exige gestão e uma justificativa (ex.:
-- "lead pediu por escrito para voltar a receber"), que fica no histórico.

create or replace function public.leads_proteger_opt_out()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.contato_bloqueado and not new.contato_bloqueado)
     or (old.sem_interesse_em is not null and new.sem_interesse_em is null) then
    if coalesce(current_setting('app.desbloqueio_autorizado', true), '') <> 'sim'
       and auth.role() is distinct from 'service_role'
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'Opt-out só pode ser desfeito pelo painel, com justificativa.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_proteger_opt_out on public.leads;
create trigger leads_proteger_opt_out
  before update of contato_bloqueado, sem_interesse_em on public.leads
  for each row execute function public.leads_proteger_opt_out();

create or replace function public.desbloquear_contato(p_lead_id uuid, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestao() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Descreva o motivo (mínimo de 10 caracteres).' using errcode = '22023';
  end if;
  perform set_config('app.desbloqueio_autorizado', 'sim', true);
  update public.leads
     set contato_bloqueado = false, sem_interesse_em = null
   where id = p_lead_id and (contato_bloqueado or sem_interesse_em is not null);
  if not found then
    raise exception 'Lead não está bloqueado.' using errcode = '22023';
  end if;
  perform set_config('app.desbloqueio_autorizado', '', true);
  insert into public.interacoes (lead_id, tipo, canal, conteudo, autor_id)
  values (p_lead_id, 'sistema', 'sistema',
          'Opt-out desfeito pelo painel. Justificativa: ' || left(trim(p_justificativa), 500),
          auth.uid());
end;
$$;

revoke all on function public.desbloquear_contato(uuid, text) from public, anon;
grant execute on function public.desbloquear_contato(uuid, text) to authenticated;

notify pgrst, 'reload schema';
