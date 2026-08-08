-- Pedidos: vendedor
DROP POLICY IF EXISTS pedidos_vendedor_update ON public.pedidos;
CREATE POLICY pedidos_vendedor_update ON public.pedidos
FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(), 'vendedor'::public.app_role))
WITH CHECK (
  vendedor_id = auth.uid()
  AND public.has_role(auth.uid(), 'vendedor'::public.app_role)
  AND public.cliente_de_vendedor(cliente_id, auth.uid())
);

-- Clientes: vendedor
DROP POLICY IF EXISTS clientes_vendedor_update ON public.clientes;
CREATE POLICY clientes_vendedor_update ON public.clientes
FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() AND public.has_role(auth.uid(), 'vendedor'::public.app_role))
WITH CHECK (vendedor_id = auth.uid() AND public.has_role(auth.uid(), 'vendedor'::public.app_role));

-- Pedidos: logistica
DROP POLICY IF EXISTS pedidos_logistica_update ON public.pedidos;
CREATE POLICY pedidos_logistica_update ON public.pedidos
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'logistica'::public.app_role)
  AND estado = ANY (ARRAY['listo_despacho'::public.pedido_estado, 'en_ruta'::public.pedido_estado])
)
WITH CHECK (
  public.has_role(auth.uid(), 'logistica'::public.app_role)
  AND estado = ANY (ARRAY['listo_despacho'::public.pedido_estado, 'en_ruta'::public.pedido_estado, 'entregado'::public.pedido_estado])
);

-- Bloquear cambios de asociacion por logistica (WITH CHECK no ve OLD)
CREATE OR REPLACE FUNCTION public.pedidos_logistica_bloquear_pivot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'logistica'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'vendedor'::public.app_role) THEN
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.creado_por IS DISTINCT FROM OLD.creado_por THEN
      RAISE EXCEPTION 'Logistica solo puede actualizar el estado de despacho del pedido'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_logistica_pivot ON public.pedidos;
CREATE TRIGGER trg_pedidos_logistica_pivot
BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.pedidos_logistica_bloquear_pivot();

REVOKE EXECUTE ON FUNCTION public.pedidos_logistica_bloquear_pivot() FROM PUBLIC, anon, authenticated;