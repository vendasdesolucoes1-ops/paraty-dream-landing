-- The initial schema enabled RLS on lotes/leads/vendedores but only granted
-- a service_role policy. The dashboard reads these tables with the
-- authenticated (anon key + logged-in session) client, so every SELECT was
-- silently returning zero rows (RLS filters rows, it doesn't error) even
-- though the tables have data — e.g. /dashboard/lotes showing "Nenhum lote
-- encontrado" despite 163 rows in the database.
--
-- Same fix already applied to whatsapp_instances/ai_agents in
-- 20260707225803_5f24ede6-0b0b-4c88-a79d-b66beec899c2.sql; this extends it
-- to the remaining single-tenant CRM tables.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;

CREATE POLICY "authenticated_all_lotes"
  ON public.lotes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_leads"
  ON public.leads FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_vendedores"
  ON public.vendedores FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_interacoes"
  ON public.interacoes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_configuracoes"
  ON public.configuracoes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
