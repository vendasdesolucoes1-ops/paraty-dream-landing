CREATE OR REPLACE FUNCTION public.upsert_lead_from_form(p_nome text, p_email text, p_telefone text, p_cidade text, p_metragem_interesse numeric, p_tipo_lote_interesse text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.leads (
    nome, email, telefone, cidade, metragem_interesse, tipo_lote_interesse,
    origem, status_crm
  )
  VALUES (
    p_nome, p_email, p_telefone, p_cidade, p_metragem_interesse, p_tipo_lote_interesse,
    'lp', 'novo'
  )
  ON CONFLICT (telefone) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = COALESCE(EXCLUDED.email, public.leads.email),
    cidade = COALESCE(EXCLUDED.cidade, public.leads.cidade),
    metragem_interesse = COALESCE(EXCLUDED.metragem_interesse, public.leads.metragem_interesse),
    tipo_lote_interesse = COALESCE(EXCLUDED.tipo_lote_interesse, public.leads.tipo_lote_interesse),
    -- Lead excluído que volta a preencher o formulário é um lead novo de fato:
    -- sem isso ele era atualizado no banco mas continuava invisível no CRM.
    deletado_em = NULL,
    status_crm = CASE WHEN public.leads.deletado_em IS NOT NULL THEN 'novo' ELSE public.leads.status_crm END
  RETURNING id;
$function$;

UPDATE public.leads
SET deletado_em = NULL, status_crm = 'novo'
WHERE telefone = '5512991519515' AND deletado_em IS NOT NULL;