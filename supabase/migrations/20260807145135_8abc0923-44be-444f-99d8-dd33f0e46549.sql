ALTER TABLE public.disparos_campanha
  ADD COLUMN IF NOT EXISTS midia_url text,
  ADD COLUMN IF NOT EXISTS midia_tipo text,
  ADD COLUMN IF NOT EXISTS midia_nome text;