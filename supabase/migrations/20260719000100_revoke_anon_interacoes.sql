-- Reverts 20260719000000_anon_interacoes_formulario.sql: the landing form no
-- longer writes to interacoes from the anon client. That logging moved to the
-- enrich-lead Edge Function (service_role), so anon no longer needs — and
-- shouldn't have — INSERT on interacoes. Idempotent so it's safe whether or
-- not the previous grant was ever applied.

DROP POLICY IF EXISTS "anon_insert_interacoes" ON public.interacoes;
REVOKE INSERT ON public.interacoes FROM anon;
