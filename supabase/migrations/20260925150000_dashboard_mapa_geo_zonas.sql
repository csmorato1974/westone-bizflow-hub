-- STAGING: heatmap por referencia geográfica aproximada + pines solo con GPS verificado. Idempotente.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS zona text;

CREATE TABLE IF NOT EXISTS public.zonas_geo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciudad text NOT NULL,
  zona text,
  nombre_display text NOT NULL,
  latitud double precision NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud double precision NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  activo boolean NOT NULL DEFAULT true,
  fuente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ciudad_normalizada text GENERATED ALWAYS AS (lower(btrim(ciudad))) STORED,
  zona_normalizada text GENERATED ALWAYS AS (lower(btrim(COALESCE(zona, '')))) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS zonas_geo_ciudad_zona_uidx ON public.zonas_geo (ciudad_normalizada, zona_normalizada);

GRANT SELECT ON public.zonas_geo TO authenticated;
GRANT ALL ON public.zonas_geo TO service_role;

ALTER TABLE public.zonas_geo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zonas_geo_personal_select ON public.zonas_geo;
CREATE POLICY zonas_geo_personal_select ON public.zonas_geo FOR SELECT TO authenticated USING (public.es_personal_interno());
DROP POLICY IF EXISTS zonas_geo_admin_all ON public.zonas_geo;
CREATE POLICY zonas_geo_admin_all ON public.zonas_geo FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.zonas_geo (ciudad, zona, nombre_display, latitud, longitud, fuente) VALUES
  ('La Paz', NULL, 'La Paz', -16.4897, -68.1193, 'centro_ciudad'),
  ('El Alto', NULL, 'El Alto', -16.5000, -68.1667, 'centro_ciudad'),
  ('Cochabamba', NULL, 'Cochabamba', -17.3935, -66.1570, 'centro_ciudad'),
  ('Santa Cruz', NULL, 'Santa Cruz', -17.7833, -63.1821, 'centro_ciudad'),
  ('Sucre', NULL, 'Sucre', -19.0333, -65.2627, 'centro_ciudad'),
  ('Oruro', NULL, 'Oruro', -17.9833, -67.1500, 'centro_ciudad'),
  ('Tarija', NULL, 'Tarija', -21.5355, -64.7296, 'centro_ciudad')
ON CONFLICT (ciudad_normalizada, zona_normalizada) DO UPDATE
  SET nombre_display = EXCLUDED.nombre_display, latitud = EXCLUDED.latitud, longitud = EXCLUDED.longitud,
      fuente = EXCLUDED.fuente, updated_at = now();

CREATE OR REPLACE FUNCTION public.dashboard_comercial(_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, _hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, _ciudad text DEFAULT NULL::text, _vendedor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
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
  v_vendedor_id := CASE WHEN v_es_admin THEN _vendedor_id ELSE v_uid END;

  WITH clientes_filtrados AS MATERIALIZED (
    SELECT c.id, c.empresa,
      COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad') AS ciudad,
      NULLIF(btrim(c.zona), '') AS zona,
      c.activo, c.latitud, c.longitud, c.gps_verificado, c.vendedor_id
    FROM public.clientes AS c
    WHERE (v_ciudad IS NULL OR lower(COALESCE(NULLIF(btrim(c.ciudad), ''), 'Sin ciudad')) = lower(v_ciudad))
      AND (v_vendedor_id IS NULL OR c.vendedor_id = v_vendedor_id)
  ),
  pedidos_filtrados AS MATERIALIZED (
    SELECT p.id,p.cliente_id,p.vendedor_id,p.total,p.created_at
    FROM public.pedidos AS p
    JOIN clientes_filtrados AS c ON c.id = p.cliente_id
    WHERE p.estado <> 'cancelado'::public.pedido_estado
      AND p.created_at >= v_desde AND p.created_at <= v_hasta
      AND (v_vendedor_id IS NULL OR p.vendedor_id = v_vendedor_id)
  ),
  ventas_cliente AS MATERIALIZED (
    SELECT p.cliente_id,sum(p.total) AS total,count(*) AS pedidos,max(p.created_at) AS ultima_compra
    FROM pedidos_filtrados AS p GROUP BY p.cliente_id
  ),
  ultima_compra_historica AS MATERIALIZED (
    SELECT p.cliente_id,max(p.created_at) AS ultima_compra
    FROM public.pedidos AS p
    JOIN clientes_filtrados AS c ON c.id = p.cliente_id
    WHERE p.estado <> 'cancelado'::public.pedido_estado
      AND p.created_at <= v_hasta
      AND (v_vendedor_id IS NULL OR p.vendedor_id = v_vendedor_id)
    GROUP BY p.cliente_id
  ),
  ciudades AS (SELECT DISTINCT c.ciudad FROM clientes_filtrados AS c ORDER BY c.ciudad),
  vendedores AS (
    SELECT DISTINCT c.vendedor_id AS id,COALESCE(NULLIF(btrim(pr.full_name), ''), 'Vendedor') AS nombre
    FROM clientes_filtrados AS c
    LEFT JOIN public.profiles AS pr ON pr.id = c.vendedor_id
    WHERE c.vendedor_id IS NOT NULL ORDER BY nombre
  ),
  kpis AS (
    SELECT jsonb_build_object(
      'ventas',COALESCE(sum(p.total),0),
      'pedidos',count(p.id),
      'ticket_promedio',COALESCE(avg(p.total),0),
      'clientes_activos',count(DISTINCT p.cliente_id) FILTER (WHERE c.activo)
    ) AS value
    FROM pedidos_filtrados AS p JOIN clientes_filtrados AS c ON c.id=p.cliente_id
  ),
  serie AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.mes),'[]'::jsonb) AS value
    FROM (SELECT to_char(date_trunc('month',p.created_at),'YYYY-MM') AS mes,sum(p.total) AS total,count(*) AS pedidos
          FROM pedidos_filtrados p GROUP BY date_trunc('month',p.created_at)) s
  ),
  ranking AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.total DESC,r.nombre),'[]'::jsonb) AS value
    FROM (SELECT p.vendedor_id,COALESCE(NULLIF(btrim(pr.full_name), ''), 'Vendedor') AS nombre,sum(p.total) AS total,count(*) AS pedidos
          FROM pedidos_filtrados p LEFT JOIN public.profiles pr ON pr.id=p.vendedor_id
          WHERE p.vendedor_id IS NOT NULL GROUP BY p.vendedor_id,pr.full_name
          ORDER BY total DESC LIMIT 5) r
  ),
  top_clientes AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total DESC,t.empresa),'[]'::jsonb) AS value
    FROM (SELECT c.id AS cliente_id,c.empresa,c.ciudad,v.total,v.pedidos
          FROM ventas_cliente v JOIN clientes_filtrados c ON c.id=v.cliente_id
          ORDER BY v.total DESC LIMIT 5) t
  ),
  top_productos AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC,t.nombre),'[]'::jsonb) AS value
    FROM (SELECT pr.id AS producto_id,pr.nombre,pr.sku,sum(pi.cantidad) AS cantidad,sum(COALESCE(pi.subtotal,pi.cantidad*pi.precio_unitario)) AS monto
          FROM public.pedido_items pi JOIN pedidos_filtrados p ON p.id=pi.pedido_id
          JOIN public.productos pr ON pr.id=pi.producto_id
          GROUP BY pr.id,pr.nombre,pr.sku ORDER BY cantidad DESC LIMIT 5) t
  ),
  ventas_ciudad AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total DESC,t.ciudad),'[]'::jsonb) AS value
    FROM (SELECT c.ciudad,sum(p.total) AS total,count(*) AS pedidos
          FROM pedidos_filtrados p JOIN clientes_filtrados c ON c.id=p.cliente_id
          GROUP BY c.ciudad ORDER BY total DESC LIMIT 8) t
  ),
  geo_clientes AS MATERIALIZED (
    SELECT c.*,
      (c.gps_verificado IS TRUE AND c.latitud BETWEEN -90 AND 90 AND c.longitud BETWEEN -180 AND 180
        AND NOT (c.latitud = 0 AND c.longitud = 0)) AS tiene_gps,
      COALESCE(gz.latitud, gc.latitud) AS geo_latitud,
      COALESCE(gz.longitud, gc.longitud) AS geo_longitud,
      CASE WHEN gz.id IS NOT NULL THEN 'zona' WHEN gc.id IS NOT NULL THEN 'ciudad' ELSE NULL END AS geo_nivel,
      COALESCE(gz.nombre_display, gc.nombre_display) AS geo_nombre,
      CASE WHEN gz.id IS NOT NULL THEN c.zona ELSE NULL END AS geo_zona
    FROM clientes_filtrados c
    LEFT JOIN public.zonas_geo gz ON gz.activo AND gz.zona IS NOT NULL
     AND gz.ciudad_normalizada = lower(btrim(c.ciudad))
     AND gz.zona_normalizada = lower(btrim(COALESCE(c.zona,'')))
    LEFT JOIN public.zonas_geo gc ON gc.activo AND gc.zona IS NULL
     AND gc.ciudad_normalizada = lower(btrim(c.ciudad))
    WHERE c.activo
  ),
  mapa_geo_pines AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.empresa),'[]'::jsonb) AS value
    FROM (SELECT g.id,g.empresa,g.ciudad,g.zona,
            g.latitud::double precision AS latitud, g.longitud::double precision AS longitud,
            COALESCE(v.total,0) AS ventas, COALESCE(v.pedidos,0) AS pedidos
          FROM geo_clientes g LEFT JOIN ventas_cliente v ON v.cliente_id=g.id
          WHERE g.tiene_gps) m
  ),
  mapa_geo_heatmap AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.ventas DESC,h.nombre),'[]'::jsonb) AS value
    FROM (SELECT lower(g.ciudad) || '|' || COALESCE(lower(g.geo_zona),'') AS clave,
            g.geo_nivel AS origen, COALESCE(g.geo_nombre, g.ciudad) AS nombre, g.ciudad, g.geo_zona AS zona,
            g.geo_latitud::double precision AS latitud, g.geo_longitud::double precision AS longitud,
            COALESCE(sum(v.total),0) AS ventas, COALESCE(sum(v.pedidos),0) AS pedidos,
            count(*)::integer AS cantidad_clientes,
            count(*) FILTER (WHERE g.tiene_gps)::integer AS clientes_con_gps,
            count(*) FILTER (WHERE NOT g.tiene_gps)::integer AS clientes_pendientes_gps
          FROM geo_clientes g LEFT JOIN ventas_cliente v ON v.cliente_id=g.id
          WHERE g.geo_latitud IS NOT NULL AND g.geo_longitud IS NOT NULL
          GROUP BY g.ciudad,g.geo_zona,g.geo_nivel,g.geo_nombre,g.geo_latitud,g.geo_longitud) h
  ),
  mapa_geo_metricas AS (
    SELECT jsonb_build_object(
      'total_clientes', count(*)::integer,
      'con_gps', count(*) FILTER (WHERE g.tiene_gps)::integer,
      'pendientes_gps', count(*) FILTER (WHERE NOT g.tiene_gps)::integer,
      'sin_referencia_geo', count(*) FILTER (WHERE g.geo_latitud IS NULL OR g.geo_longitud IS NULL)::integer,
      'representados_heatmap', count(*) FILTER (WHERE g.geo_latitud IS NOT NULL AND g.geo_longitud IS NOT NULL)::integer,
      'cobertura_gps_pct', CASE WHEN count(*) = 0 THEN 0
          ELSE round((100.0 * count(*) FILTER (WHERE g.tiene_gps) / count(*))::numeric, 1) END
    ) AS value
    FROM geo_clientes g
  ),
  oportunidades AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.ultima_compra NULLS FIRST,o.empresa),'[]'::jsonb) AS value
    FROM (SELECT c.id,c.empresa,c.ciudad,u.ultima_compra
          FROM clientes_filtrados c LEFT JOIN ultima_compra_historica u ON u.cliente_id=c.id
          WHERE c.activo AND (u.ultima_compra IS NULL OR u.ultima_compra < v_hasta - interval '90 days')
          ORDER BY u.ultima_compra NULLS FIRST,c.empresa LIMIT 5) o
  )
  SELECT jsonb_build_object(
    'kpis',kpis.value,
    'serie',serie.value,
    'ranking',ranking.value,
    'top_clientes',top_clientes.value,
    'top_productos',top_productos.value,
    'ventas_ciudad',ventas_ciudad.value,
    'mapa',mapa_geo_pines.value,
    'mapa_geo',jsonb_build_object('metricas',mapa_geo_metricas.value,'pines',mapa_geo_pines.value,'heatmap',mapa_geo_heatmap.value),
    'oportunidades',oportunidades.value,
    'filtros',jsonb_build_object(
      'ciudades',(SELECT COALESCE(jsonb_agg(ciudad ORDER BY ciudad),'[]'::jsonb) FROM ciudades),
      'vendedores',CASE WHEN v_es_admin
        THEN (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.nombre),'[]'::jsonb) FROM vendedores v)
        ELSE '[]'::jsonb END
    )
  )
  INTO v_resultado
  FROM kpis,serie,ranking,top_clientes,top_productos,ventas_ciudad,mapa_geo_pines,mapa_geo_heatmap,mapa_geo_metricas,oportunidades;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) IS 'Clave "mapa" DEPRECATED: alias exacto de mapa_geo.pines (solo GPS verificado).';
REVOKE ALL ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_comercial(timestamptz, timestamptz, text, uuid) TO authenticated;