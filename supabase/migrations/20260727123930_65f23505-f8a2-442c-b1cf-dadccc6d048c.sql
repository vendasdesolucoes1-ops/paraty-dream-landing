-- ============ IMAGERY ENGINE ============

CREATE TABLE public.imagery_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  tema TEXT NOT NULL,
  nicho TEXT,
  objetivo TEXT,
  tipo TEXT NOT NULL DEFAULT 'carrossel',
  n_slides INTEGER NOT NULL DEFAULT 5,
  copy_data JSONB,
  status TEXT NOT NULL DEFAULT 'planning',
  error_message TEXT,
  custo_total_usd NUMERIC NOT NULL DEFAULT 0,
  ig_status TEXT,
  ig_caption TEXT,
  ig_media_id TEXT,
  ig_permalink TEXT,
  ig_error TEXT,
  ig_published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imagery_posts TO authenticated;
GRANT ALL ON public.imagery_posts TO service_role;
ALTER TABLE public.imagery_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage imagery_posts" ON public.imagery_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.imagery_slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.imagery_posts(id) ON DELETE CASCADE,
  slide_n INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  needs_image BOOLEAN NOT NULL DEFAULT true,
  image_type TEXT,
  image_brief TEXT,
  raw_image_url TEXT,
  treated_image_url TEXT,
  final_png_url TEXT,
  validation_score JSONB,
  copy_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_imagery_slides_post ON public.imagery_slides(post_id, slide_n);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imagery_slides TO authenticated;
GRANT ALL ON public.imagery_slides TO service_role;
ALTER TABLE public.imagery_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage imagery_slides" ON public.imagery_slides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.imagery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.imagery_posts(id) ON DELETE CASCADE,
  slide_id UUID REFERENCES public.imagery_slides(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_excerpt TEXT,
  response_summary JSONB,
  custo_usd NUMERIC NOT NULL DEFAULT 0,
  duracao_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_imagery_logs_post ON public.imagery_logs(post_id);
GRANT SELECT, INSERT ON public.imagery_logs TO authenticated;
GRANT ALL ON public.imagery_logs TO service_role;
ALTER TABLE public.imagery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read imagery_logs" ON public.imagery_logs
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.brand_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'rule',
  title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_assets TO authenticated;
GRANT ALL ON public.brand_assets TO service_role;
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage brand_assets" ON public.brand_assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_imagery_posts_updated_at BEFORE UPDATE ON public.imagery_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_imagery_slides_updated_at BEFORE UPDATE ON public.imagery_slides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_brand_assets_updated_at BEFORE UPDATE ON public.brand_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Diretrizes iniciais da marca Moradas de Paraty
INSERT INTO public.brand_assets (type, title, content) VALUES
('tone', 'Tom de voz Moradas de Paraty', 'Sofisticado, inspirador e próximo. Fala de pertencimento, natureza e tempo — nunca de pressa ou pressão. Primeira pessoa do plural. Zero emoji, zero exclamação em excesso, zero jargão de corretor ("oportunidade única", "imperdível", "corra"). Frases curtas, prosa fluida, silêncio como recurso.'),
('rule', 'Fatos oficiais do empreendimento', 'Moradas de Paraty (loteamento residencial Sophia Saíde), Paraty/RJ. A 9 minutos do Centro Histórico. Entre a Mata Atlântica e o Rio Perequê-Açu. Infraestrutura completa, lotes de alto padrão. Nunca inventar metragens, preços ou prazos que não estejam no briefing do post.'),
('palette', 'Paleta visual', 'Verde profundo da mata (forest-deep), areia, marfim e dourado discreto. Fotografia em cor natural, luz de fim de tarde, névoa da serra. Nada de preto e branco brutalista, nada de neon, nada de gradiente roxo.'),
('typography', 'Tipografia', 'Display serifada elegante (Cormorant Garamond) para headlines, sans-serif limpa para apoio. Headlines em caixa alta apenas quando curtas.');