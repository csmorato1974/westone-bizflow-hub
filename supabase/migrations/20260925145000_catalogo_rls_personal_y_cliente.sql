-- STAGING: versiona el estado de seguridad ya aplicado. Idempotente. No toca portal por token.
CREATE OR REPLACE FUNCTION public.es_personal_interno()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.is_admin(auth.uid())
       OR public.has_role(auth.uid(), 'vendedor'::public.app_role)
       OR public.has_role(auth.uid(), 'logistica'::public.app_role))
$$;

CREATE OR REPLACE FUNCTION public.cliente_lista_precio_actual()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.lista_precio_id FROM public.clientes c
  WHERE c.user_id = auth.uid() AND c.activo = true
    AND public.has_role(auth.uid(), 'cliente'::public.app_role)
  ORDER BY c.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.cliente_puede_ver_producto(_producto uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'cliente'::public.app_role)
     AND EXISTS (
       SELECT 1 FROM public.clientes c
       WHERE c.user_id = auth.uid() AND c.activo = true AND c.lista_precio_id IS NOT NULL
         AND (EXISTS (SELECT 1 FROM public.lista_precio_items lpi
                      WHERE lpi.lista_id = c.lista_precio_id AND lpi.producto_id = _producto)
           OR EXISTS (SELECT 1 FROM public.lista_precio_variante_items lpvi
                      JOIN public.producto_variantes pv ON pv.id = lpvi.variante_id
                      WHERE lpvi.lista_id = c.lista_precio_id AND pv.producto_id = _producto)))
$$;

CREATE OR REPLACE FUNCTION public.cliente_puede_ver_variante(_variante uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'cliente'::public.app_role)
     AND EXISTS (
       SELECT 1 FROM public.clientes c
       JOIN public.producto_variantes pv ON pv.id = _variante
       WHERE c.user_id = auth.uid() AND c.activo = true AND c.lista_precio_id IS NOT NULL
         AND (EXISTS (SELECT 1 FROM public.lista_precio_variante_items lpvi
                      WHERE lpvi.lista_id = c.lista_precio_id AND lpvi.variante_id = _variante)
           OR EXISTS (SELECT 1 FROM public.lista_precio_items lpi
                      WHERE lpi.lista_id = c.lista_precio_id AND lpi.producto_id = pv.producto_id)))
$$;

DROP POLICY IF EXISTS "productos_view_auth" ON public.productos;
DROP POLICY IF EXISTS "variantes_view_auth" ON public.producto_variantes;
DROP POLICY IF EXISTS "stock_view_auth" ON public.stock;
DROP POLICY IF EXISTS "vstock_view_auth" ON public.variante_stock;
DROP POLICY IF EXISTS "listas_view_auth" ON public.listas_precios;
DROP POLICY IF EXISTS "lpi_view_auth" ON public.lista_precio_items;
DROP POLICY IF EXISTS "lpvi_view_auth" ON public.lista_precio_variante_items;
DROP POLICY IF EXISTS "wa_view_auth" ON public.whatsapp_templates;

DROP POLICY IF EXISTS productos_personal_select ON public.productos;
CREATE POLICY productos_personal_select ON public.productos FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS productos_cliente_select ON public.productos;
CREATE POLICY productos_cliente_select ON public.productos FOR SELECT TO authenticated USING (public.cliente_puede_ver_producto(id));

DROP POLICY IF EXISTS variantes_personal_select ON public.producto_variantes;
CREATE POLICY variantes_personal_select ON public.producto_variantes FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS variantes_cliente_select ON public.producto_variantes;
CREATE POLICY variantes_cliente_select ON public.producto_variantes FOR SELECT TO authenticated USING (public.cliente_puede_ver_variante(id));

DROP POLICY IF EXISTS stock_personal_select ON public.stock;
CREATE POLICY stock_personal_select ON public.stock FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS stock_cliente_select ON public.stock;
CREATE POLICY stock_cliente_select ON public.stock FOR SELECT TO authenticated USING (public.cliente_puede_ver_producto(producto_id));

DROP POLICY IF EXISTS vstock_personal_select ON public.variante_stock;
CREATE POLICY vstock_personal_select ON public.variante_stock FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS vstock_cliente_select ON public.variante_stock;
CREATE POLICY vstock_cliente_select ON public.variante_stock FOR SELECT TO authenticated USING (public.cliente_puede_ver_variante(variante_id));

DROP POLICY IF EXISTS listas_personal_select ON public.listas_precios;
CREATE POLICY listas_personal_select ON public.listas_precios FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS listas_cliente_select ON public.listas_precios;
CREATE POLICY listas_cliente_select ON public.listas_precios FOR SELECT TO authenticated USING (id = public.cliente_lista_precio_actual());

DROP POLICY IF EXISTS lpi_personal_select ON public.lista_precio_items;
CREATE POLICY lpi_personal_select ON public.lista_precio_items FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS lpi_cliente_select ON public.lista_precio_items;
CREATE POLICY lpi_cliente_select ON public.lista_precio_items FOR SELECT TO authenticated USING (lista_id = public.cliente_lista_precio_actual());

DROP POLICY IF EXISTS lpvi_personal_select ON public.lista_precio_variante_items;
CREATE POLICY lpvi_personal_select ON public.lista_precio_variante_items FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS lpvi_cliente_select ON public.lista_precio_variante_items;
CREATE POLICY lpvi_cliente_select ON public.lista_precio_variante_items FOR SELECT TO authenticated USING (lista_id = public.cliente_lista_precio_actual());

DROP POLICY IF EXISTS wa_personal_select ON public.whatsapp_templates;
CREATE POLICY wa_personal_select ON public.whatsapp_templates FOR SELECT TO authenticated USING (public.es_personal_interno());