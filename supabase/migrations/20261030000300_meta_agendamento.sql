-- Integração Meta (Ads + Instagram) — etapa 5: agendamento e alerta de token.
--
-- 1. Segredo de máquina `cron_meta_secret` (mesmo padrão do cron da fila).
-- 2. `alertar_token_meta`: aviso quando a Meta devolve erro 190 (token expirado
--    ou revogado). Reaproveita o painel de notificações e o webhook de alerta
--    (Vault `alerta_webhook_url`) que o vigia da fila já usa.
-- 3. Cron: sync de Ads e de Instagram (diários, com retomadas) e stories (horário).
--
-- Tudo idempotente: pode ser reaplicado sem erro.

-- ---------------------------------------------------------------------------
-- 1. Segredo de máquina
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_meta_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cron_meta_secret',
      'Segredo de máquina das Edge Functions meta-* (ver _shared/auth.ts).'
    );
  end if;
end $$;

-- Mesma função da migration de segurança, com o novo nome na allowlist.
create or replace function public.segredo_interno_valido(p_nome text, p_segredo text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select p_nome in ('cron_fila_secret', 'evolution_webhook_secret', 'ai_agent_chat_secret', 'cron_meta_secret')
     and p_segredo is not null
     and length(p_segredo) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
        where name = p_nome and decrypted_secret = p_segredo
     )
$$;

revoke all on function public.segredo_interno_valido(text, text) from public, anon, authenticated;
grant execute on function public.segredo_interno_valido(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Alerta de token inválido (erro 190)
-- ---------------------------------------------------------------------------
-- Devolve true quando emitiu o alerta, false quando já havia um recente
-- (no máximo um a cada 6 h: avisa sem inundar enquanto o token não é trocado).
create or replace function public.alertar_token_meta(p_detalhe text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg text;
  v_url text;
begin
  if exists (select 1 from public.alertas_enviados
              where tipo = 'meta_token_invalido' and enviado_em > now() - interval '6 hours') then
    return false;
  end if;

  v_msg := 'O token da Meta expirou ou foi revogado (erro 190) e a sincronização de Ads e Instagram parou. '
        || 'Gere um novo token do usuário do sistema e atualize META_ACCESS_TOKEN.'
        || coalesce(' Detalhe: ' || left(p_detalhe, 300), '');

  insert into public.alertas_enviados (tipo, enviado_em, detalhe)
  values ('meta_token_invalido', now(), v_msg)
  on conflict (tipo) do update set enviado_em = excluded.enviado_em, detalhe = excluded.detalhe;

  perform public.notificar_gestao('meta_alerta', 'Integração Meta parou: token inválido', v_msg, '/dashboard');

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'alerta_webhook_url';
  if v_url is not null then
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('text', '[Moradas de Paraty] ' || v_msg),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return true;
end;
$$;

revoke all on function public.alertar_token_meta(text) from public, anon, authenticated;
grant execute on function public.alertar_token_meta(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cron
-- ---------------------------------------------------------------------------
-- Horários em UTC (São Paulo = UTC−3):
--   Ads e Instagram: 06:10/06:40/07:10/07:40 e 06:25/06:55/07:25/07:55 (03h–05h).
--   Várias tentativas de propósito: a função pula se já houve sucesso nas últimas
--   20 h e retoma o que ficou pela metade (limite de tempo da Edge Function ou
--   rate limit da Meta), então só a primeira tentativa do dia costuma trabalhar.
--   Stories: todo início de hora (só ficam 24 h no ar).
do $$
declare
  j record;
begin
  for j in
    select * from (values
      ('meta-sync-ads',        '10,40 6-7 * * *', 'meta-sync-ads',        120000),
      ('meta-sync-instagram',  '25,55 6-7 * * *', 'meta-sync-instagram',  120000),
      ('meta-sync-stories',    '5 * * * *',       'meta-sync-stories',     60000)
    ) as t(nome, agenda, funcao, timeout_ms)
  loop
    if exists (select 1 from cron.job where jobname = j.nome) then
      perform cron.unschedule(j.nome);
    end if;
    perform cron.schedule(
      j.nome,
      j.agenda,
      format($cron$
        select net.http_post(
          url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', (
              select decrypted_secret from vault.decrypted_secrets
               where name = 'cron_meta_secret' limit 1
            )
          ),
          body        := '{}'::jsonb,
          timeout_milliseconds := %s
        );
      $cron$, j.funcao, j.timeout_ms)
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
