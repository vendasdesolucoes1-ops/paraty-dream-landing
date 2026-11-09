-- Rede de segurança dos formulários da Meta (Lead Ads).
--
-- O aviso em tempo real da Meta (webhook "leadgen") nunca chegou em produção:
-- até 08/11/2026 os 102 formulários do CRM entraram só pela importação manual,
-- e 48 preenchidos entre 04 e 08/11 ficaram fora do CRM. Este job importa a
-- cada 15 minutos os formulários dos últimos 2 dias. Quem já entrou é pulado
-- (meta_leads_formulario por leadgen_id) e o aviso à gestão só sai quando há
-- formulário novo. Continua valendo com o webhook funcionando.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'meta-leadgen-importar') then
    perform cron.unschedule('meta-leadgen-importar');
  end if;
end $$;

select cron.schedule(
  'meta-leadgen-importar',
  '7-59/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/meta-leadgen?acao=importar&desde='
           || to_char((now() at time zone 'America/Sao_Paulo') - interval '2 days', 'YYYY-MM-DD'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_meta_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);
