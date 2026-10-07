-- RAG da Sophia: base de conhecimento vetorizada (pgvector) com busca híbrida.
--
-- Antes: a base inteira (`configuracoes.rag_conhecimento`, ~7 mil caracteres) ia
-- no prompt a cada mensagem, sem busca. Funciona enquanto a base é pequena, mas
-- o custo e o ruído crescem junto com o texto, e nada media se o modelo estava
-- vendo a informação certa.
--
-- Agora: a fonte de verdade CONTINUA sendo a linha em `configuracoes` (é o que
-- o painel edita). Quem a lê para o prompt é um índice derivado:
--
--   configuracoes ──trigger──> edge function rag-admin ──> rag_chunks (embeddings)
--                                                              │
--   ai-agent-chat ── rag_buscar (vetor + texto, RRF) <─────────┘
--
-- O índice é descartável: apagar `rag_chunks` e salvar a base de novo o
-- reconstrói. Se ele faltar ou estiver desatualizado, a Sophia cai para a base
-- inteira (comportamento antigo) — o RAG nunca é motivo para ela ficar muda.
--
-- Tudo aqui é idempotente: pode ser reaplicado sem efeito.

-- ---------------------------------------------------------------------------
-- 1. Extensões
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 2. Documentos: registro de quais chaves de `configuracoes` são indexadas
-- ---------------------------------------------------------------------------
create table if not exists public.rag_documentos (
  chave            text primary key references public.configuracoes(chave) on delete cascade,
  -- Quem pode ler: 'agente' entra no prompt da Sophia; 'interno' é só da equipe.
  -- A busca SEMPRE filtra por escopo — é a barreira que impede preço de chegar
  -- ao lead.
  escopo           text not null check (escopo in ('agente', 'interno')),
  ativo            boolean not null default true,
  titulo           text,
  -- sha256 do texto de `configuracoes.valor` no momento em que foi indexado.
  -- É comparado com o hash atual a cada busca: índice desatualizado nunca é
  -- servido.
  conteudo_hash    text,
  modelo_embedding text,
  n_trechos        integer not null default 0,
  indexado_em      timestamptz,
  status           text not null default 'pendente' check (status in ('pendente', 'ok', 'erro')),
  erro             text,
  criado_em        timestamptz not null default now()
);

comment on table public.rag_documentos is
  'Quais chaves de configuracoes são indexadas para busca vetorial, e o estado do índice de cada uma.';

-- A base lida pela Sophia. `rag_comercial_interno` existe mas fica inativa: tem
-- preço, que nunca pode chegar ao lead (ver 20260806000000_rag_sem_precos.sql).
insert into public.rag_documentos (chave, escopo, ativo)
select v.chave, v.escopo, v.ativo
from (values
  ('rag_conhecimento', 'agente', true),
  ('rag_comercial_interno', 'interno', false)
) as v(chave, escopo, ativo)
where exists (select 1 from public.configuracoes c where c.chave = v.chave)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Trechos com embedding
-- ---------------------------------------------------------------------------
create table if not exists public.rag_chunks (
  id               uuid primary key default gen_random_uuid(),
  documento_chave  text not null references public.rag_documentos(chave) on delete cascade,
  -- sha256(modelo + texto embedado). Trecho que não mudou mantém o hash e
  -- não é embedado de novo: salvar a base custa só o que foi editado.
  hash             text not null,
  ordem            integer not null,
  secao            text not null,
  conteudo         text not null,
  embedding        extensions.vector(1536) not null,
  modelo           text not null,
  -- Busca textual em português: pega o que o vetor erra (nomes próprios, CEP,
  -- "ZOR-02", "RJ 165"), e vice-versa.
  fts              tsvector generated always as (
                     to_tsvector('portuguese', secao || ' ' || conteudo)
                   ) stored,
  criado_em        timestamptz not null default now(),
  unique (documento_chave, hash)
);

create index if not exists rag_chunks_embedding_idx
  on public.rag_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists rag_chunks_fts_idx on public.rag_chunks using gin (fts);
create index if not exists rag_chunks_documento_idx on public.rag_chunks (documento_chave, ordem);

comment on table public.rag_chunks is
  'Índice derivado de configuracoes (descartável): trechos da base de conhecimento com embedding text-embedding-3-small.';

-- ---------------------------------------------------------------------------
-- 4. Log de consultas — o que a Sophia viu e por quê
-- ---------------------------------------------------------------------------
create table if not exists public.rag_consultas (
  id                   uuid primary key default gen_random_uuid(),
  criado_em            timestamptz not null default now(),
  lead_id              uuid references public.leads(id) on delete set null,
  consulta             text not null,
  -- 'busca' = prompt montado só com os trechos recuperados; 'completo' = base inteira.
  modo                 text not null check (modo in ('busca', 'completo')),
  -- Preenchido quando 'completo' foi um recuo, não uma escolha: erro, índice
  -- desatualizado, similaridade abaixo do piso...
  motivo_recuo         text,
  chunk_ids            uuid[] not null default '{}',
  similaridades        real[] not null default '{}',
  melhor_similaridade  real,
  latencia_ms          integer
);

create index if not exists rag_consultas_criado_em_idx on public.rag_consultas (criado_em desc);
create index if not exists rag_consultas_lead_idx on public.rag_consultas (lead_id) where lead_id is not null;

comment on table public.rag_consultas is
  'Auditoria da recuperação: o que foi buscado, o que voltou e quando a Sophia recuou para a base inteira. Consultas com melhor_similaridade baixa apontam lacunas na base.';

-- ---------------------------------------------------------------------------
-- 5. Acesso: o índice é escrito só pelo service_role (edge functions).
--    Equipe de gestão pode LER, para auditar.
-- ---------------------------------------------------------------------------
alter table public.rag_documentos enable row level security;
alter table public.rag_chunks     enable row level security;
alter table public.rag_consultas  enable row level security;

revoke all on public.rag_documentos, public.rag_chunks, public.rag_consultas from anon, authenticated;
grant select on public.rag_documentos, public.rag_chunks, public.rag_consultas to authenticated;

drop policy if exists rag_documentos_gestao_le on public.rag_documentos;
create policy rag_documentos_gestao_le on public.rag_documentos
  for select to authenticated using (public.get_my_role() in ('admin', 'gestor'));

drop policy if exists rag_chunks_gestao_le on public.rag_chunks;
create policy rag_chunks_gestao_le on public.rag_chunks
  for select to authenticated using (public.get_my_role() in ('admin', 'gestor'));

drop policy if exists rag_consultas_gestao_le on public.rag_consultas;
create policy rag_consultas_gestao_le on public.rag_consultas
  for select to authenticated using (public.get_my_role() in ('admin', 'gestor'));

-- ---------------------------------------------------------------------------
-- 6. Busca híbrida: vetor + texto, fundidos por Reciprocal Rank Fusion (RRF)
-- ---------------------------------------------------------------------------
-- Por que dois braços: o embedding entende "tem mato por perto?" ≈ "áreas
-- verdes", mas tropeça em identificadores ("ZOR-02", CEP). A busca textual faz
-- o inverso. O RRF funde as DUAS listas pela posição, sem precisar comparar
-- escalas de score diferentes.
--
-- Só enxerga documentos ativos, do escopo pedido e com índice EM DIA: se o
-- texto em `configuracoes` mudou e a reindexação ainda não terminou (ou falhou),
-- devolve vazio e o chamador recua para a base inteira.
--
-- `similaridade` (cosseno, 0..1) sai para todo trecho devolvido, e `rank_texto`
-- só vem preenchido para quem também casou na busca textual: o chamador usa os
-- dois para decidir se os trechos servem (ver SIMILARIDADE_* em _shared/rag.ts).
--
-- Duas funções, de propósito:
--   rag_buscar_hibrido  núcleo com os parâmetros de fusão abertos. Existe para
--                       CALIBRAR: rag-admin {"action":"avaliar","grade":[...]}
--                       varre combinações e mede cada uma no golden set.
--   rag_buscar          a configuração de produção, com os valores que a
--                       calibração escolheu. É o que a Sophia chama. Mudar um
--                       parâmetro de produção = recriar só este wrapper.
create or replace function public.rag_buscar_hibrido(
  p_consulta     text,
  p_embedding    extensions.vector(1536),
  p_escopo       text,
  p_limite       integer,
  p_candidatos   integer,
  p_rrf_k        integer,
  p_peso_vetor   real,
  p_peso_texto   real
)
returns table (
  chunk_id     uuid,
  documento    text,
  ordem        integer,
  secao        text,
  conteudo     text,
  similaridade real,
  rank_vetor   integer,
  rank_texto   integer,
  score        real
)
language sql
stable
set search_path = public, extensions
as $$
  with em_dia as (
    select c.id, c.documento_chave, c.ordem, c.secao, c.conteudo, c.embedding, c.fts
    from rag_chunks c
    join rag_documentos d on d.chave = c.documento_chave
    join configuracoes cfg on cfg.chave = d.chave
    where d.ativo
      and d.escopo = p_escopo
      and d.status = 'ok'
      and d.conteudo_hash = encode(sha256(convert_to(cfg.valor, 'UTF8')), 'hex')
  ),
  -- OR entre os termos: pergunta em linguagem natural quase nunca contém todos
  -- os termos de um trecho, e plainto_tsquery exigiria todos (AND).
  consulta as (
    select nullif(
      replace(plainto_tsquery('portuguese', p_consulta)::text, '&', '|'), ''
    )::tsquery as q
  ),
  vetor as (
    select e.id,
           row_number() over (order by e.embedding <=> p_embedding) as rn
    from em_dia e
    order by e.embedding <=> p_embedding
    limit p_candidatos
  ),
  texto as (
    select e.id,
           row_number() over (order by ts_rank_cd(e.fts, q.q) desc) as rn
    from em_dia e, consulta q
    where q.q is not null and e.fts @@ q.q
    order by ts_rank_cd(e.fts, q.q) desc
    limit p_candidatos
  ),
  fundido as (
    select coalesce(v.id, t.id) as id,
           v.rn as rank_vetor,
           t.rn as rank_texto,
           coalesce(p_peso_vetor / (p_rrf_k + v.rn), 0)
             + coalesce(p_peso_texto / (p_rrf_k + t.rn), 0) as score
    from vetor v
    full join texto t on t.id = v.id
  )
  select e.id,
         e.documento_chave,
         e.ordem,
         e.secao,
         e.conteudo,
         (1 - (e.embedding <=> p_embedding))::real,
         f.rank_vetor::integer,
         f.rank_texto::integer,
         f.score::real
  from fundido f
  join em_dia e on e.id = f.id
  order by f.score desc
  limit greatest(p_limite, 1)
$$;

create or replace function public.rag_buscar(
  p_consulta    text,
  p_embedding   extensions.vector(1536),
  p_escopo      text    default 'agente',
  p_limite      integer default 5,
  p_candidatos  integer default 20
)
returns table (
  chunk_id     uuid,
  documento    text,
  ordem        integer,
  secao        text,
  conteudo     text,
  similaridade real,
  rank_vetor   integer,
  rank_texto   integer,
  score        real
)
language sql
stable
set search_path = public, extensions
as $$
  -- Parâmetros calibrados com o golden set (docs/rag.md, "Avaliação"):
  -- k=10 e peso do texto 0,5 deram o melhor acerto no top-5 (97,1%; o RRF
  -- clássico, k=60 e pesos iguais, dava 94,3%).
  select * from public.rag_buscar_hibrido(
    p_consulta, p_embedding, p_escopo, p_limite, p_candidatos, 10, 1.0, 0.5
  )
$$;

comment on function public.rag_buscar(text, extensions.vector, text, integer, integer) is
  'Busca híbrida (vetor + texto, RRF) nos trechos em dia de documentos ativos do escopo. Parâmetros de produção calibrados. Só service_role.';

-- ---------------------------------------------------------------------------
-- 7. Aplicação atômica do índice (usada por rag-admin)
-- ---------------------------------------------------------------------------
-- Recebe a lista COMPLETA de trechos do documento. Trecho com `embedding`
-- é inserido/atualizado; trecho sem `embedding` é um reaproveitamento (o hash
-- já existe, só a ordem pode ter mudado). O que não está na lista é removido.
-- Tudo numa transação: o índice nunca fica pela metade, e se a reindexação
-- falhar antes de chegar aqui o índice anterior segue intacto.
--
-- Recusa aplicar se o texto de `configuracoes` mudou depois que o chamador o
-- leu (duas edições seguidas): a execução mais nova é quem vale.
create or replace function public.rag_substituir_chunks(
  p_documento     text,
  p_conteudo_hash text,
  p_modelo        text,
  p_titulo        text,
  p_trechos       jsonb
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_hash_atual   text;
  v_novos        integer;
  v_reaproveitados integer;
  v_removidos    integer;
  v_total        integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('rag:' || p_documento, 0));

  select encode(sha256(convert_to(valor, 'UTF8')), 'hex')
    into v_hash_atual
    from configuracoes
   where chave = p_documento;

  if v_hash_atual is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'documento_inexistente');
  end if;
  if v_hash_atual <> p_conteudo_hash then
    return jsonb_build_object('aplicado', false, 'motivo', 'conteudo_mudou');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_trechos) as t(hash text, embedding text)
    where t.embedding is null
      and not exists (
        select 1 from rag_chunks c
         where c.documento_chave = p_documento and c.hash = t.hash
      )
  ) then
    raise exception 'trecho sem embedding e sem versão anterior em %', p_documento;
  end if;

  with ins as (
    insert into rag_chunks (documento_chave, hash, ordem, secao, conteudo, embedding, modelo)
    select p_documento, t.hash, t.ordem, t.secao, t.conteudo, t.embedding::extensions.vector, p_modelo
      from jsonb_to_recordset(p_trechos)
        as t(hash text, ordem integer, secao text, conteudo text, embedding text)
     where t.embedding is not null
    on conflict (documento_chave, hash) do update
      set ordem = excluded.ordem, secao = excluded.secao, conteudo = excluded.conteudo,
          embedding = excluded.embedding, modelo = excluded.modelo
    returning 1
  )
  select count(*) into v_novos from ins;

  with upd as (
    update rag_chunks c
       set ordem = t.ordem
      from jsonb_to_recordset(p_trechos) as t(hash text, ordem integer, embedding text)
     where t.embedding is null
       and c.documento_chave = p_documento
       and c.hash = t.hash
    returning 1
  )
  select count(*) into v_reaproveitados from upd;

  with del as (
    delete from rag_chunks c
     where c.documento_chave = p_documento
       and c.hash not in (select t.hash from jsonb_to_recordset(p_trechos) as t(hash text))
    returning 1
  )
  select count(*) into v_removidos from del;

  select count(*) into v_total from rag_chunks where documento_chave = p_documento;

  update rag_documentos
     set conteudo_hash = p_conteudo_hash,
         modelo_embedding = p_modelo,
         titulo = p_titulo,
         n_trechos = v_total,
         indexado_em = now(),
         status = 'ok',
         erro = null
   where chave = p_documento;

  return jsonb_build_object(
    'aplicado', true,
    'novos', v_novos,
    'reaproveitados', v_reaproveitados,
    'removidos', v_removidos,
    'total', v_total
  );
end;
$$;

revoke all on function public.rag_buscar(text, extensions.vector, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.rag_buscar_hibrido(text, extensions.vector, text, integer, integer, integer, real, real)
  from public, anon, authenticated;
revoke all on function public.rag_substituir_chunks(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rag_buscar(text, extensions.vector, text, integer, integer)
  to service_role;
grant execute on function public.rag_buscar_hibrido(text, extensions.vector, text, integer, integer, integer, real, real)
  to service_role;
grant execute on function public.rag_substituir_chunks(text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Reindexação automática: salvar a base no painel dispara o rag-admin
-- ---------------------------------------------------------------------------
-- O banco chama a edge function por pg_net (assíncrono: o UPDATE do painel não
-- espera os embeddings) e se autentica com um segredo PRÓPRIO do RAG, gerado
-- aqui e guardado no Vault — `rag_admin_secret`. A função não o conhece:
-- recebe o valor no cabeçalho e pergunta ao banco se confere
-- (rag_segredo_valido). Assim não existe variável de ambiente para configurar
-- e o valor nunca aparece em log nem em tela.
--
-- Por que não reaproveitar `vault.service_role_key`, que o cron de mensagens
-- agendadas já usa? Porque, em 07/10/2026, o valor guardado lá tem 28
-- caracteres e não é um JWT — é um placeholder. O cron funciona só porque
-- processar-fila-mensagens não confere autenticação. Ver docs/rag.md, "Segredos".
--
-- Uma falha no gatilho NUNCA impede salvar a base: vira WARNING, o índice fica
-- desatualizado e a Sophia usa a base inteira até a próxima reindexação.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rag_admin_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'rag_admin_secret',
      'Segredo do gatilho de reindexação do RAG (banco -> edge function rag-admin).'
    );
  end if;
end $$;

create or replace function public.rag_segredo_valido(p_segredo text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select p_segredo is not null
     and length(p_segredo) > 0
     and exists (
       select 1 from vault.decrypted_secrets
        where name = 'rag_admin_secret' and decrypted_secret = p_segredo
     )
$$;

revoke all on function public.rag_segredo_valido(text) from public, anon, authenticated;
grant execute on function public.rag_segredo_valido(text) to service_role;

create or replace function public.rag_reindexar_ao_alterar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_segredo text;
begin
  if not exists (
    select 1 from rag_documentos d where d.chave = new.chave and d.ativo
  ) then
    return new;
  end if;

  select decrypted_secret into v_segredo
    from vault.decrypted_secrets
   where name = 'rag_admin_secret'
   limit 1;

  if v_segredo is null then
    raise warning 'rag: rag_admin_secret ausente no Vault; % não será reindexada', new.chave;
    return new;
  end if;

  perform net.http_post(
    url     := 'https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/rag-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rag-secret', v_segredo
    ),
    body    := jsonb_build_object('action', 'indexar', 'chave', new.chave),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  raise warning 'rag: falha ao agendar a reindexação de %: %', new.chave, sqlerrm;
  return new;
end;
$$;

revoke all on function public.rag_reindexar_ao_alterar() from public, anon, authenticated;

drop trigger if exists rag_reindexar_ao_alterar on public.configuracoes;
create trigger rag_reindexar_ao_alterar
  after insert or update of valor on public.configuracoes
  for each row
  when (new.chave like 'rag\_%')
  execute function public.rag_reindexar_ao_alterar();

-- ---------------------------------------------------------------------------
-- 9. Chave de operação: 'busca' (padrão) ou 'completo' (base inteira no prompt)
-- ---------------------------------------------------------------------------
-- Interruptor sem deploy: se a busca algum dia se comportar mal em produção,
--   update configuracoes set valor = 'completo' where chave = 'rag_modo';
-- devolve a Sophia ao comportamento anterior na mensagem seguinte.
insert into public.configuracoes (chave, valor)
values ('rag_modo', 'busca')
on conflict (chave) do nothing;
