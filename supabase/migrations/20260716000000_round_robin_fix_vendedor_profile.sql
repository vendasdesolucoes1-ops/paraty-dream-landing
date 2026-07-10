-- 1. Round-robin fix: lock the row while picking it (FOR UPDATE SKIP LOCKED)
-- so concurrent webhook invocations can't both grab the same vendedor.

CREATE OR REPLACE FUNCTION public.get_next_round_robin_salesperson()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  proximo_vendedor_id UUID;
BEGIN
  SELECT id INTO proximo_vendedor_id
  FROM public.vendedores
  WHERE ativo = true
  ORDER BY posicao_round_robin ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF proximo_vendedor_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.vendedores
  SET posicao_round_robin = (
    SELECT COALESCE(MAX(posicao_round_robin), 0) + 1 FROM public.vendedores
  )
  WHERE id = proximo_vendedor_id;

  RETURN proximo_vendedor_id;
END;
$$;

ALTER FUNCTION public.get_next_round_robin_salesperson() SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_next_round_robin_salesperson() TO anon;
GRANT EXECUTE ON FUNCTION public.get_next_round_robin_salesperson() TO authenticated;

-- 2. Two-way link between a login (profiles) and a salesperson record (vendedores).

ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS vendedores_profile_id_key
  ON public.vendedores (profile_id)
  WHERE profile_id IS NOT NULL;

-- 3. Allow the whatsapp-webhook round-robin assignment to log itself as a
-- system-generated interaction (existing values: whatsapp, ligacao, email,
-- visita, nota).

ALTER TABLE public.interacoes DROP CONSTRAINT IF EXISTS interacoes_tipo_check;
ALTER TABLE public.interacoes
  ADD CONSTRAINT interacoes_tipo_check
  CHECK (tipo IN ('whatsapp', 'ligacao', 'email', 'visita', 'nota', 'sistema'));
