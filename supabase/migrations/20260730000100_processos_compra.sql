-- Liga o dossiê à compra: é a compra (o lote) que tem escritura e planta,
-- não o cliente. Assim os documentos do lote A não se misturam com os do B.
ALTER TABLE public.processos
  ADD COLUMN compra_id UUID REFERENCES public.compras(id) ON DELETE CASCADE;

CREATE INDEX idx_processos_compra_id ON public.processos (compra_id);

-- Atalho para a ficha do cliente listar documentos direto, sem passar por
-- processo — o upload avulso continua funcionando.
ALTER TABLE public.documentos
  ADD COLUMN compra_id UUID REFERENCES public.compras(id) ON DELETE SET NULL;

CREATE INDEX idx_documentos_compra_id ON public.documentos (compra_id);
