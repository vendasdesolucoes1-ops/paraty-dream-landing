-- Log de campanhas de disparo em massa via WhatsApp.

CREATE TABLE public.disparos_campanha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  instancia_nome TEXT NOT NULL, -- snapshot: sobrevive se a instância for renomeada/removida
  mensagem_template TEXT NOT NULL,
  fonte_contatos TEXT NOT NULL CHECK (fonte_contatos IN ('crm','csv','manual')),
  filtro_status TEXT, -- status_crm usado no filtro, só quando fonte_contatos = 'crm'
  intervalo_segundos INTEGER NOT NULL,
  total_contatos INTEGER NOT NULL,
  total_enviado INTEGER NOT NULL DEFAULT 0,
  total_falhou INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','concluido','interrompido')),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  disparado_por UUID REFERENCES public.profiles(id)
);

CREATE INDEX idx_disparos_campanha_iniciado_em ON public.disparos_campanha (iniciado_em DESC);

CREATE TABLE public.disparos_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.disparos_campanha(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL, -- nulo se veio de CSV/manual
  nome TEXT,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','falhou')),
  erro TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disparos_itens_campanha_id ON public.disparos_itens (campanha_id);
CREATE INDEX idx_disparos_itens_status ON public.disparos_itens (status);

ALTER TABLE public.disparos_campanha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestor_full_access_disparos_campanha" ON public.disparos_campanha
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_disparos_campanha" ON public.disparos_campanha
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_gestor_full_access_disparos_itens" ON public.disparos_itens
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_disparos_itens" ON public.disparos_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disparos_campanha TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disparos_itens TO authenticated;
