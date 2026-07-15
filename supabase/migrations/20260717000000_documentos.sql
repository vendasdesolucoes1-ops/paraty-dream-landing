-- get_my_role(): resolves the current authenticated user's role from
-- profiles. SECURITY DEFINER so it can also be referenced from
-- storage.objects policies (which run under the querying role and would
-- otherwise need their own RLS-safe way to read profiles).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- documentos: institutional/contract/personal files, optionally linked to a lead.

CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL, -- institucional | contrato | documento_pessoal | proposta | outro
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL, -- nulo se for institucional
  storage_path TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL, -- pdf, jpg, png
  tamanho_bytes BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id),
  tags TEXT[], -- ex: {"RG","CPF","contrato assinado"}
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documentos_lead_id ON public.documentos (lead_id);
CREATE INDEX idx_documentos_categoria ON public.documentos (categoria);

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestor_full_access_documentos" ON public.documentos
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "service_role_all_documentos" ON public.documentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;

-- Storage: private bucket for the actual files, RLS-gated the same way as
-- the documentos table (admin/gestor only — never a public bucket, files
-- are always served through signed URLs generated on demand).

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-arquivo', 'documentos-arquivo', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin_gestor_select_documentos_storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-arquivo' AND public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "admin_gestor_insert_documentos_storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-arquivo' AND public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "admin_gestor_update_documentos_storage"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-arquivo' AND public.get_my_role() IN ('admin','gestor'))
  WITH CHECK (bucket_id = 'documentos-arquivo' AND public.get_my_role() IN ('admin','gestor'));

CREATE POLICY "admin_gestor_delete_documentos_storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-arquivo' AND public.get_my_role() IN ('admin','gestor'));
