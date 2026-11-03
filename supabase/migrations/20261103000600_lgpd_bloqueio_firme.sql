-- Opt-out (LGPD) firme no banco, independente da versão das Edge Functions.
--
-- 1) Só o painel (desbloquear_contato, com justificativa) ou uma sessão SQL
--    manual desfaz um opt-out. Antes, service_role também podia — e a versão
--    publicada do whatsapp-webhook zerava contato_bloqueado a cada mensagem
--    recebida, inclusive depois de um "SAIR".
-- 2) "Sem interesse" também bloqueia envio ativo: as funções de envio
--    publicadas olham só contato_bloqueado, então os dois andam juntos.

create or replace function public.leads_proteger_opt_out()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.contato_bloqueado and not new.contato_bloqueado)
     or (old.sem_interesse_em is not null and new.sem_interesse_em is null) then
    if coalesce(current_setting('app.desbloqueio_autorizado', true), '') <> 'sim'
       and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Opt-out só pode ser desfeito pelo painel, com justificativa.'
        using errcode = '42501';
    end if;
  end if;
  if new.sem_interesse_em is not null and not coalesce(new.contato_bloqueado, false) then
    new.contato_bloqueado := true;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_proteger_opt_out on public.leads;
create trigger leads_proteger_opt_out
  before insert or update of contato_bloqueado, sem_interesse_em on public.leads
  for each row execute function public.leads_proteger_opt_out();
