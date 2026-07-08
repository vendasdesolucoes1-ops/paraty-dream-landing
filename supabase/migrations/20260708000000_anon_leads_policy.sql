-- Allows the public landing page form (unauthenticated / anon key) to insert
-- leads directly into the CRM. Read/update/delete stay restricted to
-- service_role and authenticated (dashboard) — this policy only grants INSERT.

GRANT INSERT ON public.leads TO anon;

CREATE POLICY "anon_insert_leads" ON public.leads
  FOR INSERT TO anon WITH CHECK (true);

-- The LP form also calls get_next_round_robin_salesperson() to assign the new
-- lead. That function reads/updates vendedores, which only has a service_role
-- RLS policy — as SECURITY INVOKER (the default) it would silently return
-- null for an anon caller instead of erroring. Make it SECURITY DEFINER (with
-- a locked-down search_path) so the round-robin assignment actually works
-- from the public form, without opening up direct anon access to vendedores.
alter function public.get_next_round_robin_salesperson() security definer;
alter function public.get_next_round_robin_salesperson() set search_path = public;

GRANT EXECUTE ON FUNCTION public.get_next_round_robin_salesperson() TO anon;
