-- Estadísticas de un cliente (solo admin)
CREATE OR REPLACE FUNCTION public.cliente_estadisticas(_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT jsonb_build_object(
    'total_gastado', COALESCE((SELECT SUM(p.total) FROM public.pedidos p WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'), 0),
    'pedidos', COALESCE((SELECT COUNT(*) FROM public.pedidos p WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'), 0),
    'primera_compra', (SELECT MIN(p.created_at) FROM public.pedidos p WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'),
    'ultima_compra', (SELECT MAX(p.created_at) FROM public.pedidos p WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'),
    'ticket_promedio', COALESCE((SELECT AVG(p.total) FROM public.pedidos p WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'), 0),
    'producto_top', (
      SELECT jsonb_build_object('nombre', pr.nombre, 'cantidad', SUM(pi.cantidad))
      FROM public.pedido_items pi
      JOIN public.pedidos p ON p.id = pi.pedido_id
      JOIN public.productos pr ON pr.id = pi.producto_id
      WHERE p.cliente_id = _cliente AND p.estado <> 'cancelado'
      GROUP BY pr.nombre
      ORDER BY SUM(pi.cantidad) DESC
      LIMIT 1
    ),
    'por_mes', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'mes')
      FROM (
        SELECT jsonb_build_object(
                 'mes', to_char(date_trunc('month', p.created_at), 'YYYY-MM'),
                 'total', SUM(p.total),
                 'pedidos', COUNT(*)
               ) AS x
        FROM public.pedidos p
        WHERE p.cliente_id = _cliente
          AND p.estado <> 'cancelado'
          AND p.created_at >= date_trunc('month', now()) - interval '11 months'
        GROUP BY date_trunc('month', p.created_at)
      ) s
    ), '[]'::jsonb)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.cliente_estadisticas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cliente_estadisticas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cliente_estadisticas(uuid) TO authenticated;

-- Reporte general de ventas (solo admin)
CREATE OR REPLACE FUNCTION public.reporte_ventas(_desde timestamptz DEFAULT NULL, _hasta timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  d timestamptz := COALESCE(_desde, '-infinity'::timestamptz);
  h timestamptz := COALESCE(_hasta, 'infinity'::timestamptz);
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT jsonb_build_object(
    'ventas_total', COALESCE((SELECT SUM(p.total) FROM public.pedidos p WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h), 0),
    'pedidos_total', COALESCE((SELECT COUNT(*) FROM public.pedidos p WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h), 0),
    'ticket_promedio', COALESCE((SELECT AVG(p.total) FROM public.pedidos p WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h), 0),
    'top_clientes', COALESCE((
      SELECT jsonb_agg(x)
      FROM (
        SELECT jsonb_build_object(
                 'cliente_id', c.id,
                 'empresa', c.empresa,
                 'ciudad', c.ciudad,
                 'total', SUM(p.total),
                 'pedidos', COUNT(*)
               ) AS x
        FROM public.pedidos p
        JOIN public.clientes c ON c.id = p.cliente_id
        WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h
        GROUP BY c.id, c.empresa, c.ciudad
        ORDER BY SUM(p.total) DESC
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'top_productos', COALESCE((
      SELECT jsonb_agg(x)
      FROM (
        SELECT jsonb_build_object(
                 'producto_id', pr.id,
                 'nombre', pr.nombre,
                 'sku', pr.sku,
                 'cantidad', SUM(pi.cantidad),
                 'monto', SUM(COALESCE(pi.subtotal, pi.cantidad * pi.precio_unitario))
               ) AS x
        FROM public.pedido_items pi
        JOIN public.pedidos p ON p.id = pi.pedido_id
        JOIN public.productos pr ON pr.id = pi.producto_id
        WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h
        GROUP BY pr.id, pr.nombre, pr.sku
        ORDER BY SUM(pi.cantidad) DESC
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'por_mes', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'mes')
      FROM (
        SELECT jsonb_build_object(
                 'mes', to_char(date_trunc('month', p.created_at), 'YYYY-MM'),
                 'total', SUM(p.total),
                 'pedidos', COUNT(*)
               ) AS x
        FROM public.pedidos p
        WHERE p.estado <> 'cancelado' AND p.created_at BETWEEN d AND h
        GROUP BY date_trunc('month', p.created_at)
      ) s
    ), '[]'::jsonb),
    'clientes_por_ciudad', COALESCE((
      SELECT jsonb_agg(x)
      FROM (
        SELECT jsonb_build_object('ciudad', COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad'), 'clientes', COUNT(*)) AS x
        FROM public.clientes c
        GROUP BY COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad')
        ORDER BY COUNT(*) DESC
        LIMIT 15
      ) s
    ), '[]'::jsonb),
    'clientes_estado', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'activos', COUNT(*) FILTER (WHERE c.activo),
        'inactivos', COUNT(*) FILTER (WHERE NOT c.activo),
        'provisionales', COUNT(*) FILTER (WHERE lower(COALESCE(pf.email, c.email, '')) LIKE '%@clientes-temp.local'),
        'incompletos', COUNT(*) FILTER (WHERE COALESCE(btrim(c.celular), '') = '' OR COALESCE(btrim(c.email), '') = ''),
        'sin_cuenta', COUNT(*) FILTER (WHERE c.user_id IS NULL)
      )
      FROM public.clientes c
      LEFT JOIN public.profiles pf ON pf.id = c.user_id
    )
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.reporte_ventas(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reporte_ventas(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.reporte_ventas(timestamptz, timestamptz) TO authenticated;