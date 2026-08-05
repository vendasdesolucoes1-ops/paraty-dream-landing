-- upsert_lead_from_form passa a devolver o id do lead.
--
-- Antes era RETURNS void, então o formulário não tinha como saber QUAL lead
-- havia criado — e a enrich-lead precisava reencontrá-lo pelo telefone. Essa
-- busca é frágil: se ela não achasse (telefone normalizado diferente, réplica
-- atrasada), a função abortava sem dizer nada.
--
-- Com o id em mãos, o disparo da mensagem passa a depender explicitamente da
-- persistência do lead: sem id, não há abordagem.

-- CREATE OR REPLACE não muda o tipo de retorno de uma função — é preciso
-- derrubar e recriar. Os GRANTs vão junto no DROP e precisam ser refeitos.
DROP FUNCTION IF EXISTS public.upsert_lead_from_form(text, text, text, text, numeric, text);

CREATE FUNCTION public.upsert_lead_from_form(
  p_nome text,
  p_email text,
  p_telefone text,
  p_cidade text,
  p_metragem_interesse numeric,
  p_tipo_lote_interesse text
)
RETURNS uuid
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
    -- Atualiza os dados de contato com o que veio agora, mas nunca sobrescreve
    -- um valor existente com null (COALESCE preserva o antigo).
    -- status_crm, vendedor_id e origem ficam de fora de propósito: o lead
    -- mantém o progresso que já tinha no CRM.
    nome = EXCLUDED.nome,
    email = COALESCE(EXCLUDED.email, public.leads.email),
    cidade = COALESCE(EXCLUDED.cidade, public.leads.cidade),
    metragem_interesse = COALESCE(EXCLUDED.metragem_interesse, public.leads.metragem_interesse),
    tipo_lote_interesse = COALESCE(EXCLUDED.tipo_lote_interesse, public.leads.tipo_lote_interesse)
  -- RETURNING funciona nos dois caminhos: id do inserido ou do atualizado.
  RETURNING id;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lead_from_form(
  text, text, text, text, numeric, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_lead_from_form(
  text, text, text, text, numeric, text
) TO authenticated;

-- A assinatura mudou; sem isso o PostgREST serve o catálogo antigo em cache e
-- responde 404 até reiniciar sozinho.
NOTIFY pgrst, 'reload schema';
