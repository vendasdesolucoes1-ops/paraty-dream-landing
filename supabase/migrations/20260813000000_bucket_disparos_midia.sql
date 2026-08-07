-- Bucket dos arquivos anexados a disparos em massa.
--
-- Separado de documentos-arquivo (documentação de clientes, sigilosa e de
-- retenção longa) e de imagery (peças do módulo de marketing): aqui é material
-- efêmero de campanha, com ciclo de vida próprio. Misturar os três faria
-- qualquer política de limpeza futura ter que distinguir por convenção de
-- nome, que é a hora em que alguém apaga o contrato de um comprador.
--
-- PRIVADO, servido por URL assinada. A Evolution precisa BAIXAR o arquivo para
-- enviar, então a URL tem que ser alcançável de fora — mas isso é diferente de
-- deixar o bucket aberto: a assinatura expira e não dá para listar o bucket
-- nem adivinhar o caminho de outro arquivo.

insert into storage.buckets (id, name, public)
values ('disparos-midia', 'disparos-midia', false)
on conflict (id) do nothing;

-- Mesmas regras de quem pode disparar: admin/gestor. Um vendedor não dispara
-- em massa, então também não sobe mídia de campanha.
create policy "admin_gestor_select_disparos_midia"
  on storage.objects for select to authenticated
  using (bucket_id = 'disparos-midia' and public.get_my_role() in ('admin','gestor'));

create policy "admin_gestor_insert_disparos_midia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'disparos-midia' and public.get_my_role() in ('admin','gestor'));

create policy "admin_gestor_update_disparos_midia"
  on storage.objects for update to authenticated
  using (bucket_id = 'disparos-midia' and public.get_my_role() in ('admin','gestor'))
  with check (bucket_id = 'disparos-midia' and public.get_my_role() in ('admin','gestor'));

create policy "admin_gestor_delete_disparos_midia"
  on storage.objects for delete to authenticated
  using (bucket_id = 'disparos-midia' and public.get_my_role() in ('admin','gestor'));

-- Registro do anexo na campanha, para o histórico não mentir: uma campanha que
-- mandou imagem precisa mostrar isso, senão o "mensagem_template" sozinho dá a
-- impressão de que só saiu texto.
alter table public.disparos_campanha
  add column if not exists midia_url text,
  add column if not exists midia_tipo text
    check (midia_tipo is null or midia_tipo in ('image','video','document','audio')),
  add column if not exists midia_nome text;

comment on column public.disparos_campanha.midia_url is
  'Caminho do arquivo no bucket disparos-midia. A URL assinada é gerada na hora do envio e não é guardada — ela expira.';

notify pgrst, 'reload schema';
