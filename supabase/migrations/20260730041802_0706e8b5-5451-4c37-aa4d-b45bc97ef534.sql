-- Helpers SECURITY DEFINER para romper la recursión entre clientes <-> pedidos
CREATE OR REPLACE FUNCTION public.cliente_de_usuario(_cliente uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = _cliente AND c.user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.cliente_de_vendedor(_cliente uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = _cliente AND c.vendedor_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.cliente_tiene_pedido_despacho(_cliente uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.cliente_id = _cliente
      AND p.estado IN ('listo_despacho','en_ruta','entregado')
  )
$$;

CREATE OR REPLACE FUNCTION public.es_vendedor_de_usuario(_vendedor uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clientes c WHERE c.user_id = _user AND c.vendedor_id = _vendedor)
$$;

CREATE OR REPLACE FUNCTION public.puede_ver_pedido(_pedido uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = _pedido
      AND (
        public.is_admin(_user)
        OR (p.vendedor_id = _user AND public.has_role(_user, 'vendedor'::public.app_role))
        OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p.cliente_id AND c.user_id = _user)
        OR (public.has_role(_user, 'logistica'::public.app_role)
            AND p.estado IN ('listo_despacho','en_ruta','entregado'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.cliente_de_vendedor_por_perfil(_profile uuid, _vendedor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clientes c WHERE c.user_id = _profile AND c.vendedor_id = _vendedor)
$$;
REVOKE EXECUTE ON FUNCTION public.cliente_de_vendedor_por_perfil(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_de_vendedor_por_perfil(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.puede_editar_pedido(_pedido uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = _pedido
      AND (
        public.is_admin(_user)
        OR (p.vendedor_id = _user AND public.has_role(_user, 'vendedor'::public.app_role))
        OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p.cliente_id AND c.user_id = _user)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.cliente_de_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cliente_de_vendedor(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cliente_tiene_pedido_despacho(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.es_vendedor_de_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.puede_ver_pedido(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.puede_editar_pedido(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_de_usuario(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_de_vendedor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_tiene_pedido_despacho(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_vendedor_de_usuario(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_pedido(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_editar_pedido(uuid, uuid) TO authenticated;

-- clientes: logistica sin subconsulta directa a pedidos
DROP POLICY IF EXISTS clientes_logistica_select ON public.clientes;
CREATE POLICY clientes_logistica_select ON public.clientes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'logistica'::public.app_role) AND public.cliente_tiene_pedido_despacho(id));

-- pedidos: sin subconsulta directa a clientes
DROP POLICY IF EXISTS pedidos_cliente_select ON public.pedidos;
CREATE POLICY pedidos_cliente_select ON public.pedidos FOR SELECT TO authenticated
USING (public.cliente_de_usuario(cliente_id, auth.uid()));

DROP POLICY IF EXISTS pedidos_cliente_insert ON public.pedidos;
CREATE POLICY pedidos_cliente_insert ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (creado_por = auth.uid() AND public.cliente_de_usuario(cliente_id, auth.uid()));

DROP POLICY IF EXISTS pedidos_vendedor_insert ON public.pedidos;
CREATE POLICY pedidos_vendedor_insert ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (
  creado_por = auth.uid()
  AND has_role(auth.uid(), 'vendedor'::public.app_role)
  AND vendedor_id = auth.uid()
  AND public.cliente_de_vendedor(cliente_id, auth.uid())
);

-- pedido_items
DROP POLICY IF EXISTS pi_select ON public.pedido_items;
CREATE POLICY pi_select ON public.pedido_items FOR SELECT TO authenticated
USING (public.puede_ver_pedido(pedido_id, auth.uid()));

DROP POLICY IF EXISTS pi_insert ON public.pedido_items;
CREATE POLICY pi_insert ON public.pedido_items FOR INSERT TO authenticated
WITH CHECK (public.puede_editar_pedido(pedido_id, auth.uid()));

-- profiles
DROP POLICY IF EXISTS profiles_cliente_ve_vendedor ON public.profiles;
CREATE POLICY profiles_cliente_ve_vendedor ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'cliente'::public.app_role) AND public.es_vendedor_de_usuario(id, auth.uid()));

DROP POLICY IF EXISTS profiles_vendedor_ve_clientes ON public.profiles;
CREATE POLICY profiles_vendedor_ve_clientes ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'vendedor'::public.app_role) AND public.cliente_de_vendedor_por_perfil(id, auth.uid()));