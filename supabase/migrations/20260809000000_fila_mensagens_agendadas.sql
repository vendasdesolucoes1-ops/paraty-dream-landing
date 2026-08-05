-- Fila de mensagens que a Sophia envia por iniciativa própria.
--
-- Substitui o padrão anterior: esperar dentro de EdgeRuntime.waitUntil com
-- setTimeout. Esperar dentro de uma edge function é pagar wall clock para não
-- fazer nada, e amarra a entrega ao ciclo de vida de um isolate efêmero —
-- qualquer redeploy, reciclagem ou falha mata a mensagem SEM deixar rastro,
-- que era exatamente o sintoma.
--
-- Aqui o estado é visível: dá para consultar a tabela e ver se a mensagem foi
-- criada, quando devia sair, se saiu e qual foi o erro.
--
-- ATENÇÃO — `create extension pg_cron` só funciona no banco `postgres` e exige
-- superuser. Rode este arquivo pelo SQL Editor do Supabase (que já roda como
-- postgres). Se der erro de permissão, habilite as duas extensões pelo painel
-- Database → Extensions e rode o restante.

-- ============================================================
-- 1. Extensões
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- 2. Tabela de fila
-- ============================================================
create table if not exists public.mensagens_agendadas (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  -- Discrimina o uso. Hoje só 'primeiro_contato'; follow-ups futuros entram
  -- na mesma fila sem migration nova.
  tipo           text not null default 'primeiro_contato',
  -- Congelado no enfileiramento: se o lead trocar de número depois, a mensagem
  -- pendente não muda de destino no meio do caminho.
  telefone       text not null,
  -- As N mensagens já montadas, na ordem. Guardamos o texto final, não o
  -- template — o texto é decidido quando os dados do formulário estão em mãos.
  partes         jsonb not null,
  status         text not null default 'pendente'
                 check (status in ('pendente','enviando','enviado','cancelado','erro')),
  agendado_para  timestamptz not null default now(),
  tentativas     int  not null default 0,
  enviado_em     timestamptz,
  erro           text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Única query quente do cron.
create index if not exists mensagens_agendadas_fila_idx
  on public.mensagens_agendadas (agendado_para)
  where status = 'pendente';

-- Recuperação de órfãs presas em 'enviando'.
create index if not exists mensagens_agendadas_enviando_idx
  on public.mensagens_agendadas (atualizado_em)
  where status = 'enviando';

-- "Uma tentativa por lead" garantida pelo banco, não por checagem em corrida.
-- Reenvio do formulário, retry da edge function e duas abas abertas viram um
-- ON CONFLICT DO NOTHING, não uma segunda abordagem.
create unique index if not exists mensagens_agendadas_lead_tipo_ativa_idx
  on public.mensagens_agendadas (lead_id, tipo)
  where status in ('pendente','enviando');

alter table public.mensagens_agendadas enable row level security;
-- Sem policy, deliberadamente: apenas service_role (edge functions) acessa.
-- A fila carrega telefone e texto — não deve ser legível pelo frontend.

comment on table public.mensagens_agendadas is
  'Fila de mensagens que a Sophia envia por iniciativa própria. Processada por pg_cron a cada minuto via processar-fila-mensagens.';

-- ============================================================
-- 3. Reivindicação atômica do lote
-- ============================================================
-- pg_net é fire-and-forget: o cron pode disparar de novo antes da execução
-- anterior terminar. O FOR UPDATE SKIP LOCKED é o que impede duas execuções
-- sobrepostas de mandarem a mesma mensagem duas vezes.
create or replace function public.reivindicar_mensagens_agendadas(p_limite int default 20)
returns setof public.mensagens_agendadas
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Teto de 24h. Instância fora do ar por dias não deve resultar em uma
  -- enxurrada de mensagens antigas quando ela voltar: quem preencheu o
  -- formulário ontem não quer ser abordado agora.
  update public.mensagens_agendadas
     set status = 'cancelado',
         erro = 'expirou na fila',
         atualizado_em = now()
   where status = 'pendente'
     and criado_em < now() - interval '24 hours';

  return query
  with candidatas as (
    select id
      from public.mensagens_agendadas
     where (status = 'pendente' and agendado_para <= now())
        -- Órfã: a função morreu no meio do envio. Volta a ser elegível.
        or (status = 'enviando' and atualizado_em < now() - interval '5 minutes')
     order by agendado_para
     limit p_limite
       for update skip locked
  )
  update public.mensagens_agendadas m
     set status = 'enviando',
         atualizado_em = now()
    from candidatas c
   where m.id = c.id
  returning m.*;
end;
$$;

revoke all on function public.reivindicar_mensagens_agendadas(int) from public, anon, authenticated;
grant execute on function public.reivindicar_mensagens_agendadas(int) to service_role;

-- ============================================================
-- 4. Agendamento
-- ============================================================
-- A service_role key vai para o Vault, não para o corpo do cron.job: qualquer
-- um com acesso ao SQL Editor lê `select * from cron.job`.
--
-- >>> COLE A SERVICE_ROLE KEY REAL ABAIXO ANTES DE RODAR <<<
select vault.create_secret(
  'COLE_AQUI_A_SERVICE_ROLE_KEY',
  'service_role_key',
  'Usada pelo cron para invocar edge functions via pg_net'
);

select cron.schedule(
  'processar-mensagens-agendadas',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/processar-fila-mensagens',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'service_role_key' limit 1
      )
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $cron$
);

-- Conferência:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select status, count(*) from public.mensagens_agendadas group by status;
