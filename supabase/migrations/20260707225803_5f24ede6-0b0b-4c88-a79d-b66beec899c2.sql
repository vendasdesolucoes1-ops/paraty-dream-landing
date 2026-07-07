-- Ensure Data API grants for authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;

-- Allow authenticated users full access (single-tenant CRM)
CREATE POLICY "authenticated_all_whatsapp_instances"
  ON public.whatsapp_instances FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_ai_agents"
  ON public.ai_agents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);