-- Sprint 3: portal comercial sin login, solicitudes de pedido y reserva de stock.
-- El token público se deriva con HMAC y en la tabla sólo se conserva su hash.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.portal_signing_secret (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret bytea NOT NULL
);

INSERT INTO private.portal_signing_secret (singleton, secret)
VALUES (true, extensions.gen_random_bytes(32))
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON TABLE private.portal_signing_secret FROM PUBLIC, anon, authenticated;
ALTER TABLE private.portal_signing_secret ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cliente_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_en timestamptz,
  revocado_en timestamptz
);

COMMENT ON TABLE public.cliente_portal_tokens IS
  'Credenciales revocables del portal comercial. Nunca almacena el token público en claro.';

CREATE INDEX cliente_portal_tokens_hash_activo_idx
  ON public.cliente_portal_tokens (token_hash)
  WHERE revocado_en IS NULL;

REVOKE ALL ON TABLE public.cliente_portal_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cliente_portal_tokens TO authenticated;
GRANT ALL ON TABLE public.cliente_portal_tokens TO service_role;

ALTER TABLE public.cliente_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY cliente_portal_tokens_select_scope
ON public.cliente_portal_tokens
FOR SELECT TO authenticated
USING (
  public.is_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = cliente_portal_tokens.cliente_id
      AND c.vendedor_id = (SELECT auth.uid())
  )
);

ALTER TABLE public.variante_stock
  ADD COLUMN reservado integer NOT NULL DEFAULT 0 CHECK (reservado >= 0);

COMMENT ON COLUMN public.variante_stock.reservado IS
  'Unidades comprometidas por pedidos confirmados y todavía no despachados.';

ALTER TABLE public.pedidos
  ALTER COLUMN creado_por DROP NOT NULL,
  ADD COLUMN origen text NOT NULL DEFAULT 'app' CHECK (origen IN ('app', 'portal')),
  ADD COLUMN portal_token_id uuid REFERENCES public.cliente_portal_tokens(id) ON DELETE SET NULL,
  ADD COLUMN lista_precio_id_snapshot uuid REFERENCES public.listas_precios(id) ON DELETE SET NULL,
  ADD COLUMN lista_precio_nombre_snapshot text,
  ADD COLUMN stock_reservado_at timestamptz,
  ADD COLUMN stock_consumido_at timestamptz,
  ADD COLUMN stock_liberado_at timestamptz,
  ADD CONSTRAINT pedidos_origen_autor_chk CHECK (
    (origen = 'app' AND creado_por IS NOT NULL AND portal_token_id IS NULL)
    OR (origen = 'portal' AND creado_por IS NULL AND portal_token_id IS NOT NULL)
  );

CREATE INDEX pedidos_portal_token_fecha_idx
  ON public.pedidos (portal_token_id, created_at DESC)
  WHERE portal_token_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.portal_token_calcular(_cliente_id uuid, _version uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT encode(
    extensions.hmac(
      convert_to(_cliente_id::text || ':' || _version::text, 'UTF8'),
      s.secret,
      'sha256'
    ),
    'hex'
  )
  FROM private.portal_signing_secret s
  WHERE s.singleton = true;
$$;

REVOKE ALL ON FUNCTION private.portal_token_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generar_portal_cliente(
  _cliente_id uuid,
  _rotar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente public.clientes%ROWTYPE;
  v_registro public.cliente_portal_tokens%ROWTYPE;
  v_version uuid;
  v_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cliente
  FROM public.clientes
  WHERE id = _cliente_id AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no disponible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_uid) AND v_cliente.vendedor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar este portal' USING ERRCODE = '42501';
  END IF;

  IF v_cliente.lista_precio_id IS NULL THEN
    RAISE EXCEPTION 'Asigna una lista de precios antes de generar el portal';
  END IF;

  SELECT * INTO v_registro
  FROM public.cliente_portal_tokens
  WHERE cliente_id = _cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_version := gen_random_uuid();
    v_token := private.portal_token_calcular(_cliente_id, v_version);
    INSERT INTO public.cliente_portal_tokens (
      cliente_id, version, token_hash, creado_por
    ) VALUES (
      _cliente_id,
      v_version,
      encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
      v_uid
    )
    RETURNING * INTO v_registro;
  ELSIF _rotar OR v_registro.revocado_en IS NOT NULL THEN
    v_version := gen_random_uuid();
    v_token := private.portal_token_calcular(_cliente_id, v_version);
    UPDATE public.cliente_portal_tokens
    SET version = v_version,
        token_hash = encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
        actualizado_en = now(),
        revocado_en = NULL,
        creado_por = v_uid
    WHERE id = v_registro.id
    RETURNING * INTO v_registro;
  ELSE
    v_token := private.portal_token_calcular(_cliente_id, v_registro.version);
  END IF;

  RETURN jsonb_build_object(
    'token', v_token,
    'cliente_id', v_registro.cliente_id,
    'creado_en', v_registro.creado_en,
    'actualizado_en', v_registro.actualizado_en
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revocar_portal_cliente(_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vendedor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT vendedor_id INTO v_vendedor_id
  FROM public.clientes
  WHERE id = _cliente_id;

  IF NOT FOUND OR (NOT public.is_admin(v_uid) AND v_vendedor_id IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'No tienes permiso para revocar este portal' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cliente_portal_tokens
  SET revocado_en = now(), actualizado_en = now()
  WHERE cliente_id = _cliente_id AND revocado_en IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_catalogo(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_id uuid;
  v_cliente_id uuid;
  v_lista_id uuid;
  v_resultado jsonb;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Enlace de portal inválido' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.cliente_id, c.lista_precio_id
  INTO v_token_id, v_cliente_id, v_lista_id
  FROM public.cliente_portal_tokens t
  JOIN public.clientes c ON c.id = t.cliente_id
  WHERE t.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
    AND t.revocado_en IS NULL
    AND c.activo = true;

  IF NOT FOUND OR v_lista_id IS NULL THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'cliente', jsonb_build_object(
      'empresa', c.empresa,
      'contacto', c.contacto
    ),
    'vendedor', jsonb_build_object(
      'nombre', COALESCE(p.full_name, p.username, 'Tu asesor Westone'),
      'telefono', p.phone,
      'email', p.email
    ),
    'lista_precio', jsonb_build_object(
      'id', lp.id,
      'nombre', lp.nombre
    ),
    'productos', COALESCE((
      SELECT jsonb_agg(to_jsonb(catalogo) ORDER BY catalogo.nombre, catalogo.sku)
      FROM (
        SELECT
          pr.id,
          pr.sku,
          pr.nombre,
          pr.linea::text AS linea,
          pr.descripcion,
          pr.ficha_tecnica,
          pr.imagen_url,
          jsonb_agg(
            jsonb_build_object(
              'id', pv.id,
              'presentacion', pv.presentacion,
              'precio', lpvi.precio,
              'disponibilidad', CASE
                WHEN GREATEST(COALESCE(vs.cantidad, 0) - COALESCE(vs.reservado, 0), 0) = 0 THEN 'consultar'
                WHEN GREATEST(COALESCE(vs.cantidad, 0) - COALESCE(vs.reservado, 0), 0) <= 5 THEN 'poco_stock'
                ELSE 'disponible'
              END
            ) ORDER BY pv.orden, pv.presentacion
          ) AS variantes
        FROM public.lista_precio_variante_items lpvi
        JOIN public.producto_variantes pv ON pv.id = lpvi.variante_id AND pv.activa = true
        JOIN public.productos pr ON pr.id = pv.producto_id AND pr.activo = true
        LEFT JOIN public.variante_stock vs ON vs.variante_id = pv.id
        WHERE lpvi.lista_id = v_lista_id
          AND lpvi.precio > 0
        GROUP BY pr.id, pr.sku, pr.nombre, pr.linea, pr.descripcion, pr.ficha_tecnica, pr.imagen_url
      ) catalogo
    ), '[]'::jsonb)
  ) INTO v_resultado
  FROM public.clientes c
  JOIN public.listas_precios lp ON lp.id = c.lista_precio_id AND lp.activa = true
  LEFT JOIN public.profiles p ON p.id = c.vendedor_id
  WHERE c.id = v_cliente_id;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.cliente_portal_tokens
  SET ultimo_uso_en = now()
  WHERE id = v_token_id
    AND (ultimo_uso_en IS NULL OR ultimo_uso_en < now() - interval '15 minutes');

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_crear_pedido(
  _token text,
  _items jsonb,
  _notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portal public.cliente_portal_tokens%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE;
  v_lista_nombre text;
  v_total numeric(12,2);
  v_items_count integer;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Enlace de portal inválido' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'El pedido debe incluir una lista de productos' USING ERRCODE = '22023';
  END IF;

  v_items_count := jsonb_array_length(_items);
  IF v_items_count < 1 OR v_items_count > 50 THEN
    RAISE EXCEPTION 'El pedido debe tener entre 1 y 50 productos' USING ERRCODE = '22023';
  END IF;

  IF _notas IS NOT NULL AND length(_notas) > 500 THEN
    RAISE EXCEPTION 'Las notas no pueden superar 500 caracteres' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE COALESCE(e->>'variante_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(e->>'cantidad', '') !~ '^[0-9]{1,3}$'
      OR (e->>'cantidad')::integer < 1
  ) THEN
    RAISE EXCEPTION 'Hay productos o cantidades inválidos' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    GROUP BY x.variante_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No repitas una presentación en el pedido' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_portal
  FROM public.cliente_portal_tokens t
  JOIN public.clientes c ON c.id = t.cliente_id
  WHERE t.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
    AND t.revocado_en IS NULL
    AND c.activo = true
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_cliente
  FROM public.clientes
  WHERE id = v_portal.cliente_id;

  IF v_cliente.lista_precio_id IS NULL OR v_cliente.vendedor_id IS NULL THEN
    RAISE EXCEPTION 'El portal no tiene lista de precios o vendedor asignado';
  END IF;

  IF (
    SELECT count(*)
    FROM public.pedidos p
    WHERE p.portal_token_id = v_portal.id
      AND p.created_at >= now() - interval '30 minutes'
  ) >= 10 THEN
    RAISE EXCEPTION 'Se alcanzó el límite temporal de solicitudes. Intenta más tarde.' USING ERRCODE = '54000';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    JOIN public.producto_variantes pv ON pv.id = x.variante_id AND pv.activa = true
    JOIN public.productos pr ON pr.id = pv.producto_id AND pr.activo = true
    JOIN public.lista_precio_variante_items lpvi
      ON lpvi.variante_id = pv.id AND lpvi.lista_id = v_cliente.lista_precio_id
      AND lpvi.precio > 0
  ) <> v_items_count THEN
    RAISE EXCEPTION 'Uno o más productos ya no están disponibles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    JOIN public.variante_stock vs ON vs.variante_id = x.variante_id
    WHERE GREATEST(vs.cantidad - vs.reservado, 0) < x.cantidad
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    LEFT JOIN public.variante_stock vs ON vs.variante_id = x.variante_id
    WHERE vs.variante_id IS NULL
  ) THEN
    RAISE EXCEPTION 'La disponibilidad cambió. Revisa el carrito antes de enviarlo.';
  END IF;

  SELECT lp.nombre,
         sum(x.cantidad * lpvi.precio)::numeric(12,2)
  INTO v_lista_nombre, v_total
  FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
  JOIN public.lista_precio_variante_items lpvi
    ON lpvi.variante_id = x.variante_id AND lpvi.lista_id = v_cliente.lista_precio_id
    AND lpvi.precio > 0
  JOIN public.listas_precios lp ON lp.id = lpvi.lista_id AND lp.activa = true
  GROUP BY lp.nombre;

  INSERT INTO public.pedidos (
    cliente_id,
    vendedor_id,
    creado_por,
    estado,
    total,
    notas,
    origen,
    portal_token_id,
    lista_precio_id_snapshot,
    lista_precio_nombre_snapshot
  ) VALUES (
    v_cliente.id,
    v_cliente.vendedor_id,
    NULL,
    'enviado',
    v_total,
    NULLIF(trim(_notas), ''),
    'portal',
    v_portal.id,
    v_cliente.lista_precio_id,
    v_lista_nombre
  ) RETURNING * INTO v_pedido;

  INSERT INTO public.pedido_items (
    pedido_id, producto_id, variante_id, presentacion, cantidad, precio_unitario
  )
  SELECT
    v_pedido.id,
    pv.producto_id,
    pv.id,
    pv.presentacion,
    x.cantidad,
    lpvi.precio
  FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
  JOIN public.producto_variantes pv ON pv.id = x.variante_id
  JOIN public.lista_precio_variante_items lpvi
    ON lpvi.variante_id = pv.id AND lpvi.lista_id = v_cliente.lista_precio_id;

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, link)
  SELECT destino.user_id,
         'Nueva solicitud desde portal',
         'Pedido #' || v_pedido.numero || ' de ' || v_cliente.empresa || ' por Bs ' || to_char(v_total, 'FM999999990.00'),
         'pedido',
         CASE WHEN destino.user_id = v_cliente.vendedor_id THEN '/app/pedidos' ELSE '/app/admin/pedidos' END
  FROM (
    SELECT v_cliente.vendedor_id AS user_id
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin', 'super_admin')
  ) destino
  WHERE destino.user_id IS NOT NULL;

  UPDATE public.cliente_portal_tokens
  SET ultimo_uso_en = now()
  WHERE id = v_portal.id;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'estado', v_pedido.estado,
    'total', v_pedido.total,
    'created_at', v_pedido.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_pedidos(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_portal_id uuid;
  v_cliente_id uuid;
  v_resultado jsonb;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Enlace de portal inválido' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.cliente_id INTO v_portal_id, v_cliente_id
  FROM public.cliente_portal_tokens t
  JOIN public.clientes c ON c.id = t.cliente_id AND c.activo = true
  WHERE t.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
    AND t.revocado_en IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(historial) ORDER BY historial.created_at DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT
      p.id,
      p.numero,
      p.estado::text AS estado,
      CASE p.estado
        WHEN 'enviado' THEN 'Solicitud recibida'
        WHEN 'aprobado' THEN 'Confirmado'
        WHEN 'listo_despacho' THEN 'Preparación'
        WHEN 'en_ruta' THEN 'Despachado'
        WHEN 'entregado' THEN 'Entregado'
        WHEN 'cancelado' THEN 'Cancelado'
        ELSE 'Borrador'
      END AS estado_label,
      p.total,
      p.notas,
      p.created_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'nombre', pr.nombre,
          'presentacion', pi.presentacion,
          'cantidad', pi.cantidad,
          'precio_unitario', pi.precio_unitario,
          'subtotal', pi.subtotal
        ) ORDER BY pr.nombre, pi.presentacion)
        FROM public.pedido_items pi
        JOIN public.productos pr ON pr.id = pi.producto_id
        WHERE pi.pedido_id = p.id
      ), '[]'::jsonb) AS items
    FROM public.pedidos p
    WHERE p.portal_token_id = v_portal_id
      AND p.cliente_id = v_cliente_id
    ORDER BY p.created_at DESC
    LIMIT 20
  ) historial;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.pedido_reservar_y_consumir_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  IF OLD.estado IN ('en_ruta', 'entregado')
     AND NEW.estado IN ('enviado', 'aprobado', 'listo_despacho') THEN
    RAISE EXCEPTION 'No se puede retroceder un pedido después del despacho';
  END IF;

  IF NEW.estado IN ('aprobado', 'listo_despacho', 'en_ruta')
     AND NEW.stock_reservado_at IS NULL
     AND NEW.stock_consumido_at IS NULL THEN
    FOR r IN
      SELECT pi.variante_id, sum(pi.cantidad)::integer AS cantidad
      FROM public.pedido_items pi
      WHERE pi.pedido_id = NEW.id
      GROUP BY pi.variante_id
    LOOP
      IF r.variante_id IS NULL THEN
        RAISE EXCEPTION 'El pedido contiene productos sin presentación y no puede reservar stock';
      END IF;

      UPDATE public.variante_stock
      SET reservado = reservado + r.cantidad
      WHERE variante_id = r.variante_id
        AND cantidad - reservado >= r.cantidad;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock insuficiente para confirmar el pedido';
      END IF;
    END LOOP;
    NEW.stock_reservado_at := now();
    NEW.stock_liberado_at := NULL;
  END IF;

  IF NEW.estado = 'en_ruta'
     AND NEW.stock_consumido_at IS NULL THEN
    FOR r IN
      SELECT pi.variante_id, sum(pi.cantidad)::integer AS cantidad
      FROM public.pedido_items pi
      WHERE pi.pedido_id = NEW.id
      GROUP BY pi.variante_id
    LOOP
      UPDATE public.variante_stock
      SET cantidad = cantidad - r.cantidad,
          reservado = reservado - r.cantidad
      WHERE variante_id = r.variante_id
        AND cantidad >= r.cantidad
        AND reservado >= r.cantidad;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo consumir la reserva de stock del pedido';
      END IF;
    END LOOP;
    NEW.stock_consumido_at := now();
  END IF;

  IF NEW.estado = 'cancelado'
     AND NEW.stock_reservado_at IS NOT NULL
     AND NEW.stock_consumido_at IS NULL
     AND NEW.stock_liberado_at IS NULL THEN
    FOR r IN
      SELECT pi.variante_id, sum(pi.cantidad)::integer AS cantidad
      FROM public.pedido_items pi
      WHERE pi.pedido_id = NEW.id
      GROUP BY pi.variante_id
    LOOP
      UPDATE public.variante_stock
      SET reservado = GREATEST(reservado - r.cantidad, 0)
      WHERE variante_id = r.variante_id;
    END LOOP;
    NEW.stock_liberado_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_reservar_y_consumir_stock ON public.pedidos;
CREATE TRIGGER trg_pedido_reservar_y_consumir_stock
BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION public.pedido_reservar_y_consumir_stock();

REVOKE ALL ON FUNCTION public.generar_portal_cliente(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revocar_portal_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_catalogo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_crear_pedido(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_pedidos(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_reservar_y_consumir_stock() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generar_portal_cliente(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revocar_portal_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_catalogo(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_crear_pedido(text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_pedidos(text) TO anon, authenticated;

GRANT ALL ON TABLE public.cliente_portal_tokens TO postgres;
