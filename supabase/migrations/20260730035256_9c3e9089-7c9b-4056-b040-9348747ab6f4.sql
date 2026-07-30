-- 1. Audit log integrity
DROP POLICY IF EXISTS audit_insert_auth ON public.audit_logs;
CREATE POLICY audit_insert_auth ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. conversation_participants pivot prevention
CREATE OR REPLACE FUNCTION public.prevent_cp_pivot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'No se puede cambiar la conversacion o el usuario de una participacion';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cp_pivot ON public.conversation_participants;
CREATE TRIGGER trg_prevent_cp_pivot
BEFORE UPDATE ON public.conversation_participants
FOR EACH ROW EXECUTE FUNCTION public.prevent_cp_pivot();

-- 3. Server-side price validation on pedido_items
CREATE OR REPLACE FUNCTION public.validar_precio_pedido_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lista uuid;
  v_precio numeric;
BEGIN
  IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  IF NEW.precio_unitario IS NULL OR NEW.precio_unitario <= 0 THEN
    RAISE EXCEPTION 'El precio unitario debe ser mayor a cero';
  END IF;

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT c.lista_precio_id INTO v_lista
  FROM public.pedidos p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.id = NEW.pedido_id;

  IF v_lista IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.variante_id IS NOT NULL THEN
    SELECT precio INTO v_precio
    FROM public.lista_precio_variante_items
    WHERE lista_id = v_lista AND variante_id = NEW.variante_id;
  END IF;

  IF v_precio IS NULL THEN
    SELECT precio INTO v_precio
    FROM public.lista_precio_items
    WHERE lista_id = v_lista AND producto_id = NEW.producto_id;
  END IF;

  IF v_precio IS NOT NULL AND NEW.precio_unitario <> v_precio THEN
    RAISE EXCEPTION 'El precio unitario no coincide con la lista de precios asignada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_precio_pedido_item ON public.pedido_items;
CREATE TRIGGER trg_validar_precio_pedido_item
BEFORE INSERT OR UPDATE ON public.pedido_items
FOR EACH ROW EXECUTE FUNCTION public.validar_precio_pedido_item();

-- 4. Vendedor can only create pedidos for their own clients
DROP POLICY IF EXISTS pedidos_vendedor_insert ON public.pedidos;
CREATE POLICY pedidos_vendedor_insert ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    creado_por = auth.uid()
    AND has_role(auth.uid(), 'vendedor'::app_role)
    AND vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = cliente_id AND c.vendedor_id = auth.uid()
    )
  );

-- 5. Scope pedido_items SELECT
DROP POLICY IF EXISTS pi_select ON public.pedido_items;
CREATE POLICY pi_select ON public.pedido_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_items.pedido_id
      AND (
        is_admin(auth.uid())
        OR (p.vendedor_id = auth.uid() AND has_role(auth.uid(), 'vendedor'::app_role))
        OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p.cliente_id AND c.user_id = auth.uid())
        OR (has_role(auth.uid(), 'logistica'::app_role)
            AND p.estado = ANY (ARRAY['listo_despacho'::pedido_estado,'en_ruta'::pedido_estado,'entregado'::pedido_estado]))
      )
  ));

-- 6. Logistica only sees clients with dispatchable orders
DROP POLICY IF EXISTS clientes_logistica_select ON public.clientes;
CREATE POLICY clientes_logistica_select ON public.clientes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'logistica'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.cliente_id = clientes.id
        AND p.estado = ANY (ARRAY['listo_despacho'::pedido_estado,'en_ruta'::pedido_estado,'entregado'::pedido_estado])
    )
  );

-- 7. Storage: remove public listing of buckets
DROP POLICY IF EXISTS "Avatares públicos lectura" ON storage.objects;
DROP POLICY IF EXISTS productos_public_read ON storage.objects;

CREATE POLICY avatares_owner_or_admin_list ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatares' AND ((auth.uid())::text = (storage.foldername(name))[1] OR is_admin(auth.uid())));

CREATE POLICY productos_admin_list ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'productos' AND is_admin(auth.uid()));

-- 8. Revoke EXECUTE on internal SECURITY DEFINER / trigger functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_conversation_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_cp_pivot() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.validar_precio_pedido_item() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM anon;

-- 9. user_roles: ensure no self-assignment path exists (explicit deny for non-admins)
DROP POLICY IF EXISTS roles_no_self_assign ON public.user_roles;
CREATE POLICY roles_no_self_assign ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));