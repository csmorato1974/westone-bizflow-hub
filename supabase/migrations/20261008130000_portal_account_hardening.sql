-- P0 canonicalization: provisional portal must never coexist with an active client account.
-- Source of functional truth: Lovable STAGING, with EXECUTE grants hardened explicitly.
-- Idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION public.generar_portal_cliente(
  _cliente_id uuid,
  _rotar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  WHERE id = _cliente_id
    AND activo = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no disponible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin(v_uid)
     AND v_cliente.vendedor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar este portal'
      USING ERRCODE = '42501';
  END IF;

  IF v_cliente.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este cliente ya tiene una cuenta activa; debe acceder con login'
      USING ERRCODE = '42501';
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
      cliente_id,
      version,
      token_hash,
      creado_por
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
$function$;


CREATE OR REPLACE FUNCTION public.revocar_portal_cliente(_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  IF NOT FOUND
     OR (NOT public.is_admin(v_uid) AND v_vendedor_id IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'No tienes permiso para revocar este portal'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.cliente_portal_tokens
  SET revocado_en = now(),
      actualizado_en = now()
  WHERE cliente_id = _cliente_id
    AND revocado_en IS NULL;
END;
$function$;


CREATE OR REPLACE FUNCTION public.portal_catalogo(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    AND c.activo = true
    AND c.user_id IS NULL;

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
                WHEN GREATEST(COALESCE(vs.cantidad, 0) - COALESCE(vs.reservado, 0), 0) = 0
                  THEN 'consultar'
                WHEN GREATEST(COALESCE(vs.cantidad, 0) - COALESCE(vs.reservado, 0), 0) <= 5
                  THEN 'poco_stock'
                ELSE 'disponible'
              END
            )
            ORDER BY pv.orden, pv.presentacion
          ) AS variantes
        FROM public.lista_precio_variante_items lpvi
        JOIN public.producto_variantes pv
          ON pv.id = lpvi.variante_id
         AND pv.activa = true
        JOIN public.productos pr
          ON pr.id = pv.producto_id
         AND pr.activo = true
        LEFT JOIN public.variante_stock vs
          ON vs.variante_id = pv.id
        WHERE lpvi.lista_id = v_lista_id
          AND lpvi.precio > 0
        GROUP BY
          pr.id,
          pr.sku,
          pr.nombre,
          pr.linea,
          pr.descripcion,
          pr.ficha_tecnica,
          pr.imagen_url
      ) catalogo
    ), '[]'::jsonb)
  )
  INTO v_resultado
  FROM public.clientes c
  JOIN public.listas_precios lp
    ON lp.id = c.lista_precio_id
   AND lp.activa = true
  LEFT JOIN public.profiles p
    ON p.id = c.vendedor_id
  WHERE c.id = v_cliente_id
    AND c.user_id IS NULL;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.cliente_portal_tokens
  SET ultimo_uso_en = now()
  WHERE id = v_token_id
    AND (ultimo_uso_en IS NULL OR ultimo_uso_en < now() - interval '15 minutes');

  RETURN v_resultado;
END;
$function$;


CREATE OR REPLACE FUNCTION public.portal_pedidos(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_portal_id uuid;
  v_cliente_id uuid;
  v_resultado jsonb;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Enlace de portal inválido' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.cliente_id
  INTO v_portal_id, v_cliente_id
  FROM public.cliente_portal_tokens t
  JOIN public.clientes c
    ON c.id = t.cliente_id
   AND c.activo = true
   AND c.user_id IS NULL
  WHERE t.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
    AND t.revocado_en IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(historial) ORDER BY historial.created_at DESC),
    '[]'::jsonb
  )
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
        SELECT jsonb_agg(
          jsonb_build_object(
            'nombre', pr.nombre,
            'presentacion', pi.presentacion,
            'cantidad', pi.cantidad,
            'precio_unitario', pi.precio_unitario,
            'subtotal', pi.subtotal
          )
          ORDER BY pr.nombre, pi.presentacion
        )
        FROM public.pedido_items pi
        JOIN public.productos pr
          ON pr.id = pi.producto_id
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
$function$;


CREATE OR REPLACE FUNCTION public.portal_crear_pedido(
  _token text,
  _items jsonb,
  _notas text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    SELECT 1
    FROM jsonb_array_elements(_items) e
    WHERE COALESCE(e->>'variante_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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

  SELECT t.*
  INTO v_portal
  FROM public.cliente_portal_tokens t
  JOIN public.clientes c
    ON c.id = t.cliente_id
  WHERE t.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
    AND t.revocado_en IS NULL
    AND c.activo = true
    AND c.user_id IS NULL
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_cliente
  FROM public.clientes
  WHERE id = v_portal.cliente_id
    AND activo = true
    AND user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este enlace ya no está disponible' USING ERRCODE = 'P0002';
  END IF;

  IF v_cliente.lista_precio_id IS NULL OR v_cliente.vendedor_id IS NULL THEN
    RAISE EXCEPTION 'El portal no tiene lista de precios o vendedor asignado';
  END IF;

  IF (
    SELECT count(*)
    FROM public.pedidos p
    WHERE p.portal_token_id = v_portal.id
      AND p.created_at >= now() - interval '30 minutes'
  ) >= 10 THEN
    RAISE EXCEPTION 'Se alcanzó el límite temporal de solicitudes. Intenta más tarde.'
      USING ERRCODE = '54000';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    JOIN public.producto_variantes pv
      ON pv.id = x.variante_id
     AND pv.activa = true
    JOIN public.productos pr
      ON pr.id = pv.producto_id
     AND pr.activo = true
    JOIN public.lista_precio_variante_items lpvi
      ON lpvi.variante_id = pv.id
     AND lpvi.lista_id = v_cliente.lista_precio_id
     AND lpvi.precio > 0
  ) <> v_items_count THEN
    RAISE EXCEPTION 'Uno o más productos ya no están disponibles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    JOIN public.variante_stock vs
      ON vs.variante_id = x.variante_id
    WHERE GREATEST(vs.cantidad - vs.reservado, 0) < x.cantidad
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
    LEFT JOIN public.variante_stock vs
      ON vs.variante_id = x.variante_id
    WHERE vs.variante_id IS NULL
  ) THEN
    RAISE EXCEPTION 'La disponibilidad cambió. Revisa el carrito antes de enviarlo.';
  END IF;

  SELECT
    lp.nombre,
    sum(x.cantidad * lpvi.precio)::numeric(12,2)
  INTO
    v_lista_nombre,
    v_total
  FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
  JOIN public.lista_precio_variante_items lpvi
    ON lpvi.variante_id = x.variante_id
   AND lpvi.lista_id = v_cliente.lista_precio_id
   AND lpvi.precio > 0
  JOIN public.listas_precios lp
    ON lp.id = lpvi.lista_id
   AND lp.activa = true
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
  )
  RETURNING * INTO v_pedido;

  INSERT INTO public.pedido_items (
    pedido_id,
    producto_id,
    variante_id,
    presentacion,
    cantidad,
    precio_unitario
  )
  SELECT
    v_pedido.id,
    pv.producto_id,
    pv.id,
    pv.presentacion,
    x.cantidad,
    lpvi.precio
  FROM jsonb_to_recordset(_items) AS x(variante_id uuid, cantidad integer)
  JOIN public.producto_variantes pv
    ON pv.id = x.variante_id
  JOIN public.lista_precio_variante_items lpvi
    ON lpvi.variante_id = pv.id
   AND lpvi.lista_id = v_cliente.lista_precio_id;

  INSERT INTO public.notificaciones (
    user_id,
    titulo,
    mensaje,
    tipo,
    link
  )
  SELECT
    destino.user_id,
    'Nueva solicitud desde portal',
    'Pedido #' || v_pedido.numero || ' de ' || v_cliente.empresa ||
      ' por Bs ' || to_char(v_total, 'FM999999990.00'),
    'pedido',
    CASE
      WHEN destino.user_id = v_cliente.vendedor_id THEN '/app/pedidos'
      ELSE '/app/admin/pedidos'
    END
  FROM (
    SELECT v_cliente.vendedor_id AS user_id
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'super_admin')
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
$function$;


CREATE OR REPLACE FUNCTION public.clientes_revocar_portal_al_activar_cuenta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    UPDATE public.cliente_portal_tokens
    SET revocado_en = COALESCE(revocado_en, now()),
        actualizado_en = now()
    WHERE cliente_id = NEW.id
      AND revocado_en IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_clientes_au_revocar_portal_cuenta
ON public.clientes;

CREATE TRIGGER trg_clientes_au_revocar_portal_cuenta
AFTER UPDATE OF user_id ON public.clientes
FOR EACH ROW
WHEN (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.clientes_revocar_portal_al_activar_cuenta();


-- Explicit EXECUTE surface.
REVOKE ALL ON FUNCTION public.generar_portal_cliente(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generar_portal_cliente(uuid, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.revocar_portal_cliente(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revocar_portal_cliente(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.portal_catalogo(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_catalogo(text)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.portal_pedidos(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_pedidos(text)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.portal_crear_pedido(text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_crear_pedido(text, jsonb, text)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.clientes_revocar_portal_al_activar_cuenta()
  FROM PUBLIC, anon, authenticated, service_role;
