-- Harden seller updates against account hijacking and order-total tampering.
-- Seller workflows may still update allowed operational fields (estado/notas),
-- while ownership, identity and financial pivots remain immutable.

CREATE OR REPLACE FUNCTION public.clientes_vendedor_bloquear_pivots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'vendedor'::public.app_role)
     AND OLD.vendedor_id = auth.uid() THEN
    IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.lista_precio_id IS DISTINCT FROM OLD.lista_precio_id
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'El vendedor no puede cambiar la asignacion, cuenta o email del cliente'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_vendedor_pivot ON public.clientes;
CREATE TRIGGER trg_clientes_vendedor_pivot
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.clientes_vendedor_bloquear_pivots();

CREATE OR REPLACE FUNCTION public.pedidos_vendedor_bloquear_pivots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'vendedor'::public.app_role)
     AND OLD.vendedor_id = auth.uid() THEN
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.creado_por IS DISTINCT FROM OLD.creado_por THEN
      RAISE EXCEPTION 'El vendedor no puede cambiar la asociacion ni los importes del pedido'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_vendedor_pivot ON public.pedidos;
CREATE TRIGGER trg_pedidos_vendedor_pivot
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.pedidos_vendedor_bloquear_pivots();

REVOKE ALL ON FUNCTION public.clientes_vendedor_bloquear_pivots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pedidos_vendedor_bloquear_pivots() FROM PUBLIC, anon, authenticated;
