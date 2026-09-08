-- Dashboard comercial agregado en base de datos.
-- SECURITY INVOKER es intencional: clientes, pedidos y pedido_items conservan
-- el alcance efectivo de las politicas RLS del usuario que llama la funcion.
CREATE OR REPLACE FUNCTION public.dashboard_comercial(
  _desde timestamptz DEFAULT NULL,
  _hasta timestamptz DEFAULT NULL,
  _ciudad text DEFAULT NULL,
  _vendedor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_es_admin boolean;
  v_es_vendedor boolean;
  v_vendedor_id uuid;
  v_desde timestamptz := COALESCE(_desde, '-infinity'::timestamptz);
  v_hasta timestamptz := COALESCE(_hasta, now());
  v_ciudad text := NULLIF(btrim(_ciudad), '');
  v_resultado jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  v_es_admin := (SELECT public.is_admin(v_uid));
  v_es_vendedor := (SELECT public.has_role(v_uid, 'vendedor'::public.app_role));

  IF NOT v_es_admin AND NOT v_es_vendedor THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_hasta < v_desde THEN
    RAISE EXCEPTION 'Rango de fechas no valido' USING ERRCODE = '22007';
  END IF;

  -- Un vendedor nunca puede ampliar su alcance mediante el parametro.
  v_vendedor_id := CASE WHEN v_es_admin THEN _vendedor_id ELSE v_uid END;

  WITH clientes_filtrados AS MATERIALIZED (
    SELECT
      c.id,
      c.empresa,
      COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad') AS ciudad,
      c.activo,
      c.latitud,
      c.longitud,
      c.vendedor_id
    FROM public.clientes AS c
    WHERE (v_ciudad IS NULL OR lower(COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad')) = lower(v_ciudad))
      AND (v_vendedor_id IS NULL OR c.vendedor_id = v_vendedor_id)
  ),
  pedidos_filtrados AS MATERIALIZED (
    SELECT p.id, p.cliente_id, p.vendedor_id, p.total, p.created_at
    FROM public.pedidos AS p
    JOIN clientes_filtrados AS c ON c.id = p.cliente_id
    WHERE p.estado <> 'cancelado'::public.pedido_estado
      AND p.created_at >= v_desde
      AND p.created_at <= v_hasta
      AND (v_vendedor_id IS NULL OR p.vendedor_id = v_vendedor_id)
  ),
  ventas_cliente AS MATERIALIZED (
    SELECT p.cliente_id, sum(p.total) AS total, count(*) AS pedidos, max(p.created_at) AS ultima_compra
    FROM pedidos_filtrados AS p
    GROUP BY p.cliente_id
  ),
  ciudades AS (
    SELECT DISTINCT c.ciudad
    FROM clientes_filtrados AS c
    ORDER BY c.ciudad
  ),
  vendedores AS (
    SELECT DISTINCT
      c.vendedor_id AS id,
      COALESCE(NULLIF(btrim(pr.full_name), ''), 'Vendedor') AS nombre
    FROM clientes_filtrados AS c
    LEFT JOIN public.profiles AS pr ON pr.id = c.vendedor_id
    WHERE c.vendedor_id IS NOT NULL
    ORDER BY nombre
  ),
  kpis AS (
    SELECT jsonb_build_object(
      'ventas', COALESCE(sum(p.total), 0),
      'pedidos', count(p.id),
      'ticket_promedio', COALESCE(avg(p.total), 0),
      'clientes_activos', count(DISTINCT p.cliente_id) FILTER (WHERE c.activo)
    ) AS value
    FROM pedidos_filtrados AS p
    JOIN clientes_filtrados AS c ON c.id = p.cliente_id
  ),
  serie AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) AS value
    FROM (
      SELECT to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS mes,
             sum(p.total) AS total,
             count(*) AS pedidos
      FROM pedidos_filtrados AS p
      GROUP BY date_trunc('month', p.created_at)
    ) AS s
  ),
  ranking AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.total DESC, r.nombre), '[]'::jsonb) AS value
    FROM (
      SELECT p.vendedor_id,
             COALESCE(NULLIF(btrim(pr.full_name), ''), 'Vendedor') AS nombre,
             sum(p.total) AS total,
             count(*) AS pedidos
      FROM pedidos_filtrados AS p
      LEFT JOIN public.profiles AS pr ON pr.id = p.vendedor_id
      WHERE p.vendedor_id IS NOT NULL
      GROUP BY p.vendedor_id, pr.full_name
      ORDER BY total DESC
      LIMIT 5
    ) AS r
  ),
  top_clientes AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total DESC, t.empresa), '[]'::jsonb) AS value
    FROM (
      SELECT c.id AS cliente_id, c.empresa, c.ciudad, v.total, v.pedidos
      FROM ventas_cliente AS v
      JOIN clientes_filtrados AS c ON c.id = v.cliente_id
      ORDER BY v.total DESC
      LIMIT 5
    ) AS t
  ),
  top_productos AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC, t.nombre), '[]'::jsonb) AS value
    FROM (
      SELECT pr.id AS producto_id, pr.nombre, pr.sku,
             sum(pi.cantidad) AS cantidad,
             sum(COALESCE(pi.subtotal, pi.cantidad * pi.precio_unitario)) AS monto
      FROM public.pedido_items AS pi
      JOIN pedidos_filtrados AS p ON p.id = pi.pedido_id
      JOIN public.productos AS pr ON pr.id = pi.producto_id
      GROUP BY pr.id, pr.nombre, pr.sku
      ORDER BY cantidad DESC
      LIMIT 5
    ) AS t
  ),
  ventas_ciudad AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total DESC, t.ciudad), '[]'::jsonb) AS value
    FROM (
      SELECT c.ciudad, sum(p.total) AS total, count(*) AS pedidos
      FROM pedidos_filtrados AS p
      JOIN clientes_filtrados AS c ON c.id = p.cliente_id
      GROUP BY c.ciudad
      ORDER BY total DESC
      LIMIT 8
    ) AS t
  ),
  mapa AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.empresa), '[]'::jsonb) AS value
    FROM (
      SELECT c.id, c.empresa, c.ciudad,
             c.latitud::double precision AS latitud,
             c.longitud::double precision AS longitud,
             COALESCE(v.total, 0) AS ventas,
             COALESCE(v.pedidos, 0) AS pedidos
      FROM clientes_filtrados AS c
      LEFT JOIN ventas_cliente AS v ON v.cliente_id = c.id
      WHERE c.activo
        AND c.latitud BETWEEN -90 AND 90
        AND c.longitud BETWEEN -180 AND 180
    ) AS m
  ),
  oportunidades AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.ultima_compra NULLS FIRST, o.empresa), '[]'::jsonb) AS value
    FROM (
      SELECT c.id, c.empresa, c.ciudad, v.ultima_compra
      FROM clientes_filtrados AS c
      LEFT JOIN ventas_cliente AS v ON v.cliente_id = c.id
      WHERE c.activo
        AND (v.ultima_compra IS NULL OR v.ultima_compra < v_hasta - interval '90 days')
      ORDER BY v.ultima_compra NULLS FIRST, c.empresa
      LIMIT 5
    ) AS o
  )
  SELECT jsonb_build_object(
    'kpis', kpis.value,
    'serie', serie.value,
    'ranking', ranking.value,
    'top_clientes', top_clientes.value,
    'top_productos', top_productos.value,
    'ventas_ciudad', ventas_ciudad.value,
    'mapa', mapa.value,
    'oportunidades', oportunidades.value,
    'filtros', jsonb_build_object(
      'ciudades', (SELECT COALESCE(jsonb_agg(ciudad ORDER BY ciudad), '[]'::jsonb) FROM ciudades),
      'vendedores', CASE WHEN v_es_admin THEN
        (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.nombre), '[]'::jsonb) FROM vendedores AS v)
        ELSE '[]'::jsonb END
    )
  )
  INTO v_resultado
  FROM kpis, serie, ranking, top_clientes, top_productos, ventas_ciudad, mapa, oportunidades;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) IS
  'Agregados del dashboard comercial con filtros coherentes y alcance heredado de RLS.';

CREATE INDEX IF NOT EXISTS pedidos_dashboard_fecha_vendedor_cliente_idx
  ON public.pedidos (created_at DESC, vendedor_id, cliente_id)
  WHERE estado <> 'cancelado'::public.pedido_estado;

CREATE INDEX IF NOT EXISTS clientes_dashboard_vendedor_ciudad_idx
  ON public.clientes (vendedor_id, lower(btrim(ciudad)))
  WHERE activo;
