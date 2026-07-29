-- Mantém lotes.status coerente com a carteira de compras.
--
-- A regra é uma invariante entre duas tabelas, então vive no banco: se ficasse
-- só na tela, um insert vindo de import, edge function ou SQL manual deixaria
-- o mapa de lotes divergindo da carteira de clientes.

CREATE OR REPLACE FUNCTION public.sync_lote_status(p_lote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ocupado BOOLEAN;
  v_status TEXT;
BEGIN
  IF p_lote_id IS NULL THEN RETURN; END IF;

  -- 'quitado' e 'inadimplente' seguem ocupando o lote: quitar não devolve o
  -- terreno, e atraso de parcela não é distrato. Só 'distratado' libera.
  SELECT EXISTS (
    SELECT 1 FROM public.compras
    WHERE lote_id = p_lote_id
      AND status IN ('ativo','quitado','inadimplente')
  ) INTO v_ocupado;

  SELECT status INTO v_status FROM public.lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_ocupado THEN
    IF v_status IS DISTINCT FROM 'vendido' THEN
      UPDATE public.lotes SET status = 'vendido' WHERE id = p_lote_id;
    END IF;
  -- Só desfaz o que este mecanismo fez. Um lote em 'reservado' pertence ao
  -- funil do lead e não pode ser zerado por um distrato de outro contrato.
  ELSIF v_status = 'vendido' THEN
    UPDATE public.lotes SET status = 'disponivel' WHERE id = p_lote_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.compras_sync_lote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- O lote antigo é reavaliado sempre que sai de cena (delete, ou troca de
  -- lote_id numa correção de cadastro) — senão ficaria 'vendido' para sempre.
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.sync_lote_status(OLD.lote_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.sync_lote_status(NEW.lote_id);
  END IF;
  RETURN NULL;
END;
$$;

-- AFTER: a linha já está gravada, então a checagem de "existe compra ativa"
-- enxerga o estado final, inclusive a própria linha recém-inserida.
CREATE TRIGGER trg_compras_sync_lote
  AFTER INSERT OR UPDATE OF lote_id, status OR DELETE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.compras_sync_lote();

-- Reconcilia o que já existe no banco (nada, se a carteira ainda está vazia).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT lote_id FROM public.compras WHERE lote_id IS NOT NULL LOOP
    PERFORM public.sync_lote_status(r.lote_id);
  END LOOP;
END $$;
