-- S-04 — RLS do Imagery Engine por papel.
--
-- As tabelas nasceram com "FOR ALL TO authenticated USING (true) WITH CHECK (true)",
-- o que dava a qualquer usuário logado — inclusive vendedor — acesso total de
-- leitura, escrita e exclusão a posts, slides, logs de custo e às diretrizes de
-- marca. Marketing é função de admin/gestor, então as policies passam a usar
-- public.get_my_role(), o mesmo padrão já adotado no módulo de Documentos.

-- imagery_posts
DROP POLICY IF EXISTS "Authenticated manage imagery_posts" ON public.imagery_posts;
CREATE POLICY "admin_gestor_all_imagery_posts" ON public.imagery_posts
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

-- imagery_slides
DROP POLICY IF EXISTS "Authenticated manage imagery_slides" ON public.imagery_slides;
CREATE POLICY "admin_gestor_all_imagery_slides" ON public.imagery_slides
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

-- imagery_logs — leitura apenas; quem escreve é o service_role das edge functions.
DROP POLICY IF EXISTS "Authenticated read imagery_logs" ON public.imagery_logs;
CREATE POLICY "admin_gestor_read_imagery_logs" ON public.imagery_logs
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'));

REVOKE INSERT ON public.imagery_logs FROM authenticated;

-- brand_assets
DROP POLICY IF EXISTS "Authenticated manage brand_assets" ON public.brand_assets;
CREATE POLICY "admin_gestor_all_brand_assets" ON public.brand_assets
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

-- Objetos do bucket privado "imagery": as artes seguem o mesmo recorte de papel.
-- O pipeline continua escrevendo via service_role, que ignora RLS.
DROP POLICY IF EXISTS "Authenticated read imagery objects" ON storage.objects;
CREATE POLICY "admin_gestor_read_imagery_objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imagery' AND public.get_my_role() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Authenticated insert imagery objects" ON storage.objects;
CREATE POLICY "admin_gestor_insert_imagery_objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imagery' AND public.get_my_role() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Authenticated update imagery objects" ON storage.objects;
CREATE POLICY "admin_gestor_update_imagery_objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'imagery' AND public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (bucket_id = 'imagery' AND public.get_my_role() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Authenticated delete imagery objects" ON storage.objects;
CREATE POLICY "admin_gestor_delete_imagery_objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'imagery' AND public.get_my_role() IN ('admin','gestor'));
