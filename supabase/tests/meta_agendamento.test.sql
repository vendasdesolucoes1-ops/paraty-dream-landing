-- Integração Meta, etapa 5: segredo do cron, alerta de token (erro 190) e agenda.
\set ON_ERROR_STOP 1
begin;
do $$
declare v_seg text; v_gestor uuid := '00000000-0000-0000-0000-00000000e4e1'; n integer; v_ok boolean;
begin
  insert into auth.users (id, email) values (v_gestor, 'g@agenda.local');
  insert into public.profiles (id, email, nome, role, ativo)
  values (v_gestor, 'g@agenda.local', 'Gestor', 'gestor', true)
  on conflict (id) do update set role = 'gestor', ativo = true;

  -- Segredo do cron: criado no Vault, aceito pela allowlist; valor errado não.
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'cron_meta_secret';
  assert v_seg is not null and length(v_seg) >= 32, 'cron_meta_secret criado com tamanho mínimo';
  assert public.segredo_interno_valido('cron_meta_secret', v_seg), 'segredo correto é aceito';
  assert not public.segredo_interno_valido('cron_meta_secret', v_seg || 'x'), 'segredo errado é recusado';
  assert not public.segredo_interno_valido('cron_meta_secret', null), 'nulo é recusado';
  assert not public.segredo_interno_valido('outro_segredo', v_seg), 'fora da allowlist é recusado';
  -- Os segredos antigos continuam valendo.
  assert public.segredo_interno_valido('cron_fila_secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_fila_secret')), 'cron da fila segue válido';

  -- Agenda: os três jobs existem e usam o segredo do Vault (nunca um valor literal).
  assert (select count(*) from cron.job where jobname in ('meta-sync-ads', 'meta-sync-instagram', 'meta-sync-stories')) = 3,
         'três jobs agendados';
  assert (select schedule from cron.job where jobname = 'meta-sync-stories') = '5 * * * *', 'stories de hora em hora';
  assert (select schedule from cron.job where jobname = 'meta-sync-ads') = '10,40 6-7 * * *', 'ads diário com retomadas';
  assert (select command from cron.job where jobname = 'meta-sync-ads') like '%/functions/v1/meta-sync-ads%', 'URL da função';
  assert (select command from cron.job where jobname = 'meta-sync-ads') like '%name = ''cron_meta_secret''%', 'segredo vem do Vault';
  assert (select command from cron.job where jobname = 'meta-sync-ads') not like '%' || v_seg || '%', 'segredo não aparece no comando';

  -- Alerta de token: avisa a gestão uma vez, dedupe de 6 h.
  v_ok := public.alertar_token_meta('Session has expired');
  assert v_ok, 'primeiro alerta é emitido';
  assert (select count(*) from public.alertas_enviados where tipo = 'meta_token_invalido') = 1, 'alerta registrado';
  select count(*) into n from public.notifications where user_id = v_gestor and type = 'meta_alerta';
  assert n = 1, 'gestão notificada';
  assert (select body from public.notifications where user_id = v_gestor and type = 'meta_alerta') like '%META_ACCESS_TOKEN%',
         'a mensagem diz o que fazer';
  assert not public.alertar_token_meta('de novo'), 'dedupe: sem segundo alerta em 6 h';
  update public.alertas_enviados set enviado_em = now() - interval '7 hours' where tipo = 'meta_token_invalido';
  assert public.alertar_token_meta('ainda expirado'), 'passadas 6 h, avisa de novo';
  select count(*) into n from public.notifications where user_id = v_gestor and type = 'meta_alerta';
  assert n = 2, 'segunda notificação';

  -- Só a service_role executa o alerta.
  set local role authenticated;
  begin
    perform public.alertar_token_meta('x');
    assert false, 'authenticated não deveria executar';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
