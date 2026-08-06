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
    'lp', 'qualificado'
  )
  ON CONFLICT (telefone) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = COALESCE(EXCLUDED.email, public.leads.email),
    cidade = COALESCE(EXCLUDED.cidade, public.leads.cidade),
    metragem_interesse = COALESCE(EXCLUDED.metragem_interesse, public.leads.metragem_interesse),
    tipo_lote_interesse = COALESCE(EXCLUDED.tipo_lote_interesse, public.leads.tipo_lote_interesse),
    -- Preencheu o formulário agora: a origem passa a ser a Landing Page e o
    -- lead volta ao topo da fila do CRM (ordenada por created_at).
    origem = 'lp',
    created_at = now(),
    deletado_em = NULL,
    -- Ficha preenchida = já qualificado. Só promove quem está no começo do
    -- funil (ou voltou de excluído): quem já avançou não regride.
    status_crm = CASE
      WHEN public.leads.deletado_em IS NOT NULL THEN 'qualificado'
      WHEN public.leads.status_crm IN ('novo', 'perdido') THEN 'qualificado'
      ELSE public.leads.status_crm
    END
  RETURNING id;
$function$;