-- Objetos do Imagery Engine que existiam em produção sem migration no
-- repositório (auditoria R-30, issue #43): tabela imagery_acervo, RPC
-- pick_acervo_image e bucket privado "imagery".
--
-- Reconstruído a partir do uso no código (_shared/acervo.ts, acervo-panel.tsx,
-- imagery-plan-post, imagery-validate-image) e dos tipos gerados
-- (src/integrations/supabase/types.ts). Tudo é idempotente: em produção, onde
-- os objetos já existem, nada é recriado; num banco novo (staging, CI,
-- supabase start) o schema passa a sair inteiro das migrations.
--
-- ANTES DE APLICAR EM PRODUÇÃO, confira se a definição real bate:
--   select pg_get_functiondef('public.pick_acervo_image(text, text)'::regprocedure);
--   select * from pg_policies where tablename = 'imagery_acervo';
-- Se divergir, ajuste ESTE arquivo para refletir a produção (a produção é a
-- verdade; esta migration é o registro dela).

insert into storage.buckets (id, name, public)
values ('imagery', 'imagery', false)
on conflict (id) do nothing;

create table if not exists public.imagery_acervo (
  id                uuid primary key default gen_random_uuid(),
  brand_slug        text not null default 'moradas_paraty',
  titulo            text,
  tag_tipo          text not null
                    check (tag_tipo in ('aerea', 'paisagem', 'arquitetura', 'agua', 'detalhe', 'vida')),
  file_path         text not null,
  file_url          text not null,
  origem            text not null default 'upload',
  slide_id          uuid references public.imagery_slides(id) on delete set null,
  contem_pessoas    boolean not null default false,
  validation_media  numeric,
  ativo             boolean not null default true,
  uso_count         integer not null default 0,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists imagery_acervo_pick_idx
  on public.imagery_acervo (brand_slug, tag_tipo, ativo, last_used_at nulls first);

alter table public.imagery_acervo enable row level security;

do $$
begin
  -- Só cria as políticas se a tabela ainda não tiver nenhuma (banco novo):
  -- em produção as existentes são mantidas.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'imagery_acervo') then
    create policy "imagery_acervo_select_gestao" on public.imagery_acervo
      for select to authenticated using (public.sou_gestao());
    create policy "imagery_acervo_write_gestao" on public.imagery_acervo
      for all to authenticated using (public.sou_gestao()) with check (public.sou_gestao());
    create policy "imagery_acervo_service_role" on public.imagery_acervo
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.imagery_acervo to authenticated;

-- Rotação "menos usado recentemente" por tag, sem pessoas, com o uso
-- incrementado atomicamente (duas gerações simultâneas não pegam a mesma).
do $$
begin
  if to_regprocedure('public.pick_acervo_image(text, text)') is null then
    execute $f$
      create function public.pick_acervo_image(p_tag text, p_brand_slug text default 'moradas_paraty')
      returns public.imagery_acervo
      language sql
      security definer
      set search_path = public
      as $body$
        update public.imagery_acervo a
           set uso_count = a.uso_count + 1,
               last_used_at = now(),
               updated_at = now()
         where a.id = (
           select id from public.imagery_acervo
            where brand_slug = p_brand_slug
              and tag_tipo = p_tag
              and ativo
              and not contem_pessoas
            order by last_used_at nulls first, uso_count
            limit 1
            for update skip locked
         )
        returning a.*
      $body$
    $f$;
    revoke all on function public.pick_acervo_image(text, text) from public, anon, authenticated;
    grant execute on function public.pick_acervo_image(text, text) to service_role;
  end if;
end $$;
