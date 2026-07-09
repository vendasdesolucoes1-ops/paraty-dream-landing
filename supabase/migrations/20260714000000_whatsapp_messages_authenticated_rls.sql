-- whatsapp_messages was created with RLS enabled but only a service_role
-- policy (20260701100000_whatsapp_agent.sql), so the dashboard's
-- authenticated client silently got zero rows back for every query —
-- same root cause already fixed for lotes/leads/vendedores/interacoes in
-- 20260710000000_lotes_leads_authenticated_rls.sql. This is why the new
-- Lead detail drawer's "Conversas WhatsApp" tab showed "nenhuma mensagem
-- encontrada" even for leads with a valid lead_id and existing messages.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;

CREATE POLICY "authenticated_all_whatsapp_messages"
  ON public.whatsapp_messages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
