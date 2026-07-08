-- Marketing module: default configuracoes rows + posts_marketing table.

INSERT INTO configuracoes (chave, valor) VALUES
  ('instagram_token', ''),
  ('instagram_user_id', ''),
  ('marca_nome', 'Moradas de Paraty'),
  ('marca_cor_primaria', '#1C3A2B'),
  ('marca_cor_secundaria', '#C9A96E')
ON CONFLICT (chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.posts_marketing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text,
  copy_texto text NOT NULL,
  hashtags text,
  imagem_url text,
  status text DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'agendado', 'erro')),
  instagram_post_id text,
  publicado_em timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.posts_marketing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_crud_posts" ON public.posts_marketing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_posts_marketing" ON public.posts_marketing
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts_marketing TO authenticated;
