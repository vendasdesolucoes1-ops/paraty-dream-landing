-- Processos: agrupador de documentos (ex: "Fabiana Aparecida Cordeiro - Locação").
-- Um documento pode pertencer a um processo e/ou continuar vinculado a um lead —
-- os dois vínculos são independentes.

CREATE TABLE public.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL, -- ex: locacao, venda, institucional
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestor_full_access_processos" ON public.processos
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_processos" ON public.processos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos TO authenticated;

ALTER TABLE public.documentos
  ADD COLUMN processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL;

CREATE INDEX idx_documentos_processo_id ON public.documentos (processo_id);
