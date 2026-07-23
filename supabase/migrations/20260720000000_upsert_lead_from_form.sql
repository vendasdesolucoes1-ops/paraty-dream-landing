-- Idempotent lead creation for the public landing-page form.
--
-- The form can legitimately be submitted more than once with the same phone
-- (unique index leads_phone_key), which made a plain anon INSERT return 409.
-- A client-side .upsert() can't solve it cleanly: anon has INSERT but not
-- UPDATE (and granting UPDATE would let anyone overwrite any lead by phone),
-- and a single upsert payload can't both set origem='lp'/status_crm='novo' on
-- insert AND preserve them on update.
--
-- So the conflict is handled here, in a SECURITY DEFINER function: a real
-- INSERT ... ON CONFLICT (telefone) DO UPDATE that refreshes only the contact
-- fields and leaves the lead's CRM progress (status_crm, vendedor_id, origem)
-- untouched on an existing record. anon only gets EXECUTE on this one function
-- — no direct UPDATE access to the leads table.

CREATE OR REPLACE FUNCTION public.upsert_lead_from_form(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cidade text,
  p_metragem_interesse numeric,
  p_tipo_lote_interesse text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.leads (
    nome, email, telefone, cidade, metragem_interesse, tipo_lote_interesse,
    origem, status_crm
  )
  VALUES (
    p_nome, p_email, p_telefone, p_cidade, p_metragem_interesse, p_tipo_lote_interesse,
    'lp', 'novo'
  )
  ON CONFLICT (telefone) DO UPDATE SET
    -- Refresh the contact fields with the newly submitted values, but never
    -- clobber an existing value with null (COALESCE keeps the old one).
    -- status_crm, vendedor_id and origem are intentionally NOT in this list,
    -- so the lead keeps whatever CRM progress it already had.
    nome = EXCLUDED.nome,
    email = COALESCE(EXCLUDED.email, public.leads.email),
    cidade = COALESCE(EXCLUDED.cidade, public.leads.cidade),
    metragem_interesse = COALESCE(EXCLUDED.metragem_interesse, public.leads.metragem_interesse),
    tipo_lote_interesse = COALESCE(EXCLUDED.tipo_lote_interesse, public.leads.tipo_lote_interesse);
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lead_from_form(
  text, text, text, text, numeric, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_lead_from_form(
  text, text, text, text, numeric, text
) TO authenticated;
