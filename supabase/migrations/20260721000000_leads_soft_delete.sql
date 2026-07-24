-- Soft delete for leads. A physical DELETE would fail with a foreign-key
-- violation on leads that already have whatsapp_messages / interacoes / visitas
-- (those FKs are NO ACTION on purpose, to preserve history). Instead, "deleting"
-- a lead just stamps deletado_em; every active listing filters it out, but the
-- row and all its linked history stay intact. Nullable so a future "restore"
-- screen can simply clear it back to NULL.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deletado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_deletado_em ON public.leads (deletado_em);
