-- Allows the public landing page form (unauthenticated / anon key) to log a
-- system interaction right after creating a lead, so the CRM's lead history
-- shows "veio do formulário do site" with the details the visitor filled in.
-- Mirrors the anon_insert_leads policy (20260708000000): INSERT only, read/
-- update/delete stay restricted to service_role and authenticated.

GRANT INSERT ON public.interacoes TO anon;

CREATE POLICY "anon_insert_interacoes" ON public.interacoes
  FOR INSERT TO anon WITH CHECK (true);
