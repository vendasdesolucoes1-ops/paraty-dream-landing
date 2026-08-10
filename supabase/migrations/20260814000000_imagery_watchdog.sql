-- Watchdog do pipeline de imagens.
--
-- O pipeline roda em EdgeRuntime.waitUntil: se o isolate morre no meio (deploy,
-- reciclagem, EarlyDrop), ninguém escreve o estado final. Todo 'failed' hoje é
-- escrito por um caminho de erro DENTRO de uma execução viva — quando não há
-- execução, não há quem registre. O post fica em 'generating' para sempre, sem
-- mensagem, e o usuário não tem como distinguir "ainda rodando" de "morreu".
--
-- Só cobre 'generating'. 'draft' é estado de repouso legítimo (plano pronto
-- aguardando o clique em "Gerar as artes") — varrer draft transformaria todo
-- rascunho em alarme falso.
--
-- ANTES DE RODAR ESTA MIGRATION: veja quantos posts já estão presos hoje, para
-- não ser surpreendido pelo primeiro passe encerrando vários de uma vez. A
-- consulta abaixo não altera nada.
--
--   select p.id, p.tema, p.status,
--          greatest(p.updated_at, coalesce(max(s.updated_at), p.updated_at)) as ultima_atividade
--     from public.imagery_posts p
--     left join public.imagery_slides s on s.post_id = p.id
--    where p.status = 'generating'
--    group by p.id, p.tema, p.status, p.updated_at
--    order by ultima_atividade;

create extension if not exists pg_cron with schema cron;

create or replace function public.imagery_watchdog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Inatividade, não duração total: mede o intervalo sem NENHUMA escrita no
  -- post nem nos seus slides. O trecho mais silencioso de um pipeline vivo é
  -- uma geração inteira (~4,5 min no pior caso, com os dois retries de 503),
  -- então 20 min é ~4x de folga.
  v_limite constant interval := interval '20 minutes';
  v_ids    uuid[];
  v_slides int := 0;
  v_posts  int := 0;
begin
  -- O updated_at do post sozinho não serve: durante a geração quem é tocado
  -- são os slides. Um post de 5 slides progredindo normalmente tem o próprio
  -- updated_at parado desde o início do pipeline.
  select array_agg(t.id) into v_ids
    from (
      select p.id
        from public.imagery_posts p
        left join public.imagery_slides s on s.post_id = p.id
       where p.status = 'generating'
       group by p.id, p.updated_at
      having greatest(p.updated_at, coalesce(max(s.updated_at), p.updated_at))
             < now() - v_limite
    ) t;

  if v_ids is null then
    return jsonb_build_object('posts', 0, 'slides', 0);
  end if;

  -- Referências a colunas no SET enxergam o valor ANTIGO, então `status` aqui
  -- é o estado em que o slide morreu — é essa a informação útil na mensagem.
  -- coalesce preserva um erro real que já tenha sido gravado antes.
  update public.imagery_slides
     set status = 'failed',
         error_message = coalesce(
           error_message,
           format('A geração não foi concluída: o slide ficou parado em "%s" '
                  'por mais de 20 minutos e o processo não respondeu. '
                  'Clique em "Gerar as artes" para tentar de novo.', status)
         )
   where post_id = any(v_ids)
     and status not in ('ready', 'failed');
  get diagnostics v_slides = row_count;

  -- Mesma regra do finalizePostIfSettled (imagery-orchestrate:74). Não é
  -- "post travado = post falhou": se o worker morreu depois do último slide
  -- ficar pronto, as artes existem e o post tem que fechar em 'ready'.
  update public.imagery_posts p
     set status = case
                    when x.total = 0        then 'failed'
                    when x.falhas = x.total then 'failed'
                    else 'ready'
                  end,
         error_message = case
                           when x.total = 0 then 'Post sem slides.'
                           when x.falhas > 0
                             then format('%s/%s artes com problema.', x.falhas, x.total)
                           else null
                         end,
         custo_total_usd = x.custo
    from (
      select p2.id,
             count(s.id)                                 as total,
             count(*) filter (where s.status = 'failed') as falhas,
             coalesce((select sum(l.custo_usd)
                         from public.imagery_logs l
                        where l.post_id = p2.id), 0)     as custo
        from public.imagery_posts p2
        left join public.imagery_slides s on s.post_id = p2.id
       where p2.id = any(v_ids)
       group by p2.id
    ) x
   where p.id = x.id;
  get diagnostics v_posts = row_count;

  -- Sem isso o watchdog é invisível: um post reaparecendo como 'failed' sem
  -- rastro é indistinguível de uma falha comum, e a diferença importa para
  -- saber se o problema é o Google ou a infraestrutura das edge functions.
  insert into public.imagery_logs (post_id, step, provider, model,
                                   response_summary, success)
  select id, 'watchdog', 'pg_cron', null,
         jsonb_build_object('motivo', 'inatividade', 'limite', '20 minutes'),
         true
    from unnest(v_ids) as id;

  return jsonb_build_object('posts', v_posts, 'slides', v_slides);
end;
$$;

comment on function public.imagery_watchdog() is
  'Encerra posts de imagery presos em generating por inatividade. Recuperável: o imagery-orchestrate reseta os slides para queued a cada invocação, então o botão "Gerar as artes" refaz o post.';

-- Só o cron (postgres) e o service_role executam. Um usuário autenticado não
-- tem motivo para forçar o encerramento de posts alheios.
revoke all on function public.imagery_watchdog() from public, authenticated, anon;
grant execute on function public.imagery_watchdog() to service_role;

-- Reagendável sem erro: rodar a migration duas vezes não cria job duplicado.
select cron.unschedule('imagery-watchdog')
 where exists (select 1 from cron.job where jobname = 'imagery-watchdog');

select cron.schedule(
  'imagery-watchdog',
  '*/5 * * * *',
  $cron$ select public.imagery_watchdog(); $cron$
);

notify pgrst, 'reload schema';
