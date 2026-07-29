-- CLIENTE COMPRADOR: quem já comprou. Separado de lead (funil) porque a
-- relação pós-venda dura até 180 meses e não tem status de funil.

CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Origem do cliente. SET NULL: apagar o lead não pode apagar o comprador.
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  telefone TEXT,
  email TEXT,
  data_nascimento DATE,
  estado_civil TEXT,
  profissao TEXT,
  -- Endereço de correspondência: boleto e escritura vão para cá.
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CPF único quando informado. Parcial: vários clientes sem CPF convivem,
-- mas o mesmo CPF não entra duas vezes por engano.
CREATE UNIQUE INDEX idx_clientes_cpf_unico
  ON public.clientes (cpf) WHERE cpf IS NOT NULL;
-- Um lead vira cliente uma vez só: evita duplicar por duplo clique no botão.
CREATE UNIQUE INDEX idx_clientes_lead_unico
  ON public.clientes (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_clientes_nome ON public.clientes (nome);

-- COMPRAS: um cliente pode ter vários lotes. Cada compra é um contrato.
CREATE TABLE public.compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  -- RESTRICT: não deixar apagar um lote que tem contrato vinculado.
  lote_id UUID REFERENCES public.lotes(id) ON DELETE RESTRICT,
  numero_contrato TEXT,
  data_compra DATE,
  valor_total NUMERIC(14,2),
  valor_entrada NUMERIC(14,2),
  num_parcelas INTEGER,
  valor_parcela NUMERIC(14,2),
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_primeira_parcela DATE,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','quitado','distratado','inadimplente')),
  escritura_emitida BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compras_cliente_id ON public.compras (cliente_id);
CREATE INDEX idx_compras_lote_id ON public.compras (lote_id);
CREATE INDEX idx_compras_status ON public.compras (status);

-- Um lote não pode ter dois contratos ATIVOS ao mesmo tempo (venda duplicada).
-- Histórico continua possível: o contrato antigo vira 'distratado' e sai do
-- índice, liberando o lote para um novo contrato 'ativo'.
CREATE UNIQUE INDEX idx_compras_lote_ativo_unico
  ON public.compras (lote_id) WHERE status = 'ativo' AND lote_id IS NOT NULL;

-- updated_at automático, mesmo padrão de imagery_posts/brand_assets.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_compras_updated_at BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: só admin/gestor. Vendedor NÃO enxerga carteira de cliente.
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestor_full_access_clientes" ON public.clientes
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_clientes" ON public.clientes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_gestor_full_access_compras" ON public.compras
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_compras" ON public.compras
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras  TO authenticated;
