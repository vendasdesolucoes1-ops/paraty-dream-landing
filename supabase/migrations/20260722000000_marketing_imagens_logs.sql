-- Marketing image generation moves from OpenAI DALL-E 3 (temporary URLs that
-- expire in ~1h) to the Lovable AI Gateway, with the resulting image persisted
-- in Supabase Storage. Adds:
--   1. a public bucket for the generated images;
--   2. marketing_logs, a per-step cost/latency audit trail (fixes the missing
--      spend traceability reported as N-04).

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-imagens', 'marketing-imagens', true)
ON CONFLICT (id) DO NOTHING;

-- The bucket is public: Instagram's Graph API fetches image_url server-side and
-- cannot present credentials, so the object must be anonymously readable.
DROP POLICY IF EXISTS "public_read_marketing_imagens" ON storage.objects;
CREATE POLICY "public_read_marketing_imagens"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketing-imagens');

-- Only the edge function (service_role) writes here; the frontend never uploads.
DROP POLICY IF EXISTS "service_role_write_marketing_imagens" ON storage.objects;
CREATE POLICY "service_role_write_marketing_imagens"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'marketing-imagens');

CREATE TABLE IF NOT EXISTS public.marketing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts_marketing(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  prompt_excerto TEXT,
  custo_usd NUMERIC(10,5) DEFAULT 0,
  duracao_ms INT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spend reports are always read by date; the post join is the secondary path.
CREATE INDEX IF NOT EXISTS marketing_logs_created_at_idx
  ON public.marketing_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_logs_post_id_idx
  ON public.marketing_logs (post_id);

ALTER TABLE public.marketing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gestor_read_marketing_logs" ON public.marketing_logs;
CREATE POLICY "admin_gestor_read_marketing_logs" ON public.marketing_logs
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'));

DROP POLICY IF EXISTS "service_role_insert_marketing_logs" ON public.marketing_logs;
CREATE POLICY "service_role_insert_marketing_logs" ON public.marketing_logs
  FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.marketing_logs TO authenticated;
