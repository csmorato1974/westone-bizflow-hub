-- Protege las columnas sensibles que pueden modificar los vendedores y
-- mantiene pedidos.total derivado de los subtotales de pedido_items.
--
-- Decisiones de negocio de esta primera version:
--   * empresa y activo no son editables por vendedor;
--   * enviado -> cancelado permanece bloqueado;
--   * notas permanece editable;
--   * una captura GPS debe atribuirse al vendedor autenticado.


-- ============================================================================
-- Total derivado de pedido_items
-- ============================================================================


CREATE OR REPLACE FUNCTION public.pedido_items_recalcular_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pedido_ids := ARRAY[NEW.pedido_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_pedido_ids := ARRAY[OLD.pedido_id];
  ELSE
    v_pedido_ids := ARRAY[OLD.pedido_id, NEW.pedido_id];
  END IF;


  SELECT array_agg(DISTINCT x.pedido_id ORDER BY x.pedido_id)
  INTO v_pedido_ids
  FROM unnest(v_pedido_ids) AS x(pedido_id)
  WHERE x.pedido_id IS NOT NULL;


  IF COALESCE(array_length(v_pedido_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;


  -- Bloquea los pedidos en orden estable para reducir riesgo de deadlocks
  -- cuando un item cambia de pedido.
  PERFORM p.id
  FROM public.pedidos AS p
  WHERE p.id = ANY(v_pedido_ids)
  ORDER BY p.id
  FOR UPDATE;


  WITH totales AS (
    SELECT
      a.pedido_id,
      COALESCE(SUM(pi.subtotal), 0)::numeric(12,2) AS total
    FROM unnest(v_pedido_ids) AS a(pedido_id)
    LEFT JOIN public.pedido_items AS pi
      ON pi.pedido_id = a.pedido_id
    GROUP BY a.pedido_id
  )
  UPDATE public.pedidos AS p
  SET total = t.total
  FROM totales AS t
  WHERE p.id = t.pedido_id
    AND p.total IS DISTINCT FROM t.total;


  -- El valor de retorno se ignora en un trigger AFTER.
  RETURN NULL;
END;
$$;


COMMENT ON FUNCTION public.pedido_items_recalcular_total() IS
  'Mantiene pedidos.total como suma de pedido_items.subtotal. Uso exclusivo por trigger.';


-- ============================================================================
-- Guard de clientes para vendedores no administradores
-- ============================================================================


CREATE OR REPLACE FUNCTION public.clientes_vendedor_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_columnas_permitidas constant text[] := ARRAY[
    'contacto',
    'celular',
    'telefono_normalizado',
    'direccion',
    'ciudad',
    'notas',
    'latitud',
    'longitud',
    'precision_metros',
    'gps_capturado_en',
    'gps_capturado_por',
    'gps_verificado'
  ]::text[];
  v_cambio_gps boolean;
BEGIN
  IF v_uid IS NULL
     OR public.is_admin(v_uid)
     OR NOT public.has_role(v_uid, 'vendedor'::public.app_role) THEN
    RETURN NEW;
  END IF;


  -- Al quitar solo las columnas permitidas, cualquier otra diferencia queda
  -- bloqueada. Esto incluye empresa, activo, identidad, asignaciones,
  -- onboarding, importacion y cualquier columna futura no autorizada.
  IF (to_jsonb(NEW) - v_columnas_permitidas)
       IS DISTINCT FROM
     (to_jsonb(OLD) - v_columnas_permitidas) THEN
    RAISE EXCEPTION
      'El vendedor solo puede modificar datos operativos del cliente'
      USING ERRCODE = '42501';
  END IF;


  v_cambio_gps :=
       NEW.latitud IS DISTINCT FROM OLD.latitud
    OR NEW.longitud IS DISTINCT FROM OLD.longitud
    OR NEW.precision_metros IS DISTINCT FROM OLD.precision_metros
    OR NEW.gps_capturado_en IS DISTINCT FROM OLD.gps_capturado_en
    OR NEW.gps_capturado_por IS DISTINCT FROM OLD.gps_capturado_por
    OR NEW.gps_verificado IS DISTINCT FROM OLD.gps_verificado;


  IF v_cambio_gps
     AND NEW.gps_capturado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION
      'La captura GPS debe quedar atribuida al vendedor autenticado'
      USING ERRCODE = '42501';
  END IF;


  RETURN NEW;
END;
$$;


COMMENT ON FUNCTION public.clientes_vendedor_update_guard() IS
  'Limita a vendedores no administradores a campos operativos de clientes.';


-- ============================================================================
-- Guard de pedidos para vendedores no administradores
-- ============================================================================


CREATE OR REPLACE FUNCTION public.pedidos_vendedor_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_es_logistica boolean;
  v_permitir_enviado_cancelado constant boolean := false;
  v_recalc_owner name;
  v_total_canonico numeric(12,2);
BEGIN
  IF v_uid IS NULL
     OR public.is_admin(v_uid)
     OR NOT public.has_role(v_uid, 'vendedor'::public.app_role) THEN
    RETURN NEW;
  END IF;


  v_es_logistica :=
    public.has_role(v_uid, 'logistica'::public.app_role);


  -- Excepcion estrecha para el UPDATE anidado que origina el trigger de
  -- pedido_items. Ademas de validar profundidad y propietario, exige que el
  -- nuevo total coincida con la suma canonica de los items.
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
  INTO v_recalc_owner
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid =
    'public.pedido_items_recalcular_total()'::pg_catalog.regprocedure;


  IF pg_catalog.pg_trigger_depth() > 1
     AND current_user = v_recalc_owner
     AND (to_jsonb(NEW) - 'total')
           IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'total') THEN


    SELECT COALESCE(SUM(pi.subtotal), 0)::numeric(12,2)
    INTO v_total_canonico
    FROM public.pedido_items AS pi
    WHERE pi.pedido_id = NEW.id;


    IF NEW.total IS NOT DISTINCT FROM v_total_canonico THEN
      RETURN NEW;
    END IF;


    RAISE EXCEPTION
      'El recalculo interno intento guardar un total no canonico'
      USING ERRCODE = '23514';
  END IF;


  -- Para vendedor, solo notas y estado pueden cambiar. updated_at queda fuera
  -- para que no pueda falsificarse; trg_pedidos_updated lo completa despues.
  IF (to_jsonb(NEW) - ARRAY['notas', 'estado']::text[])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['notas', 'estado']::text[]) THEN
    RAISE EXCEPTION
      'El vendedor solo puede modificar notas y transiciones autorizadas'
      USING ERRCODE = '42501';
  END IF;


  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      -- Flujo comercial del vendedor.
      (
        OLD.estado = 'borrador'::public.pedido_estado
        AND NEW.estado IN (
          'enviado'::public.pedido_estado,
          'cancelado'::public.pedido_estado
        )
      )


      -- Se conserva como opcion explicita, deshabilitada en esta version.
      OR (
        v_permitir_enviado_cancelado
        AND OLD.estado = 'enviado'::public.pedido_estado
        AND NEW.estado = 'cancelado'::public.pedido_estado
      )


      -- Conserva el flujo de usuarios con roles vendedor y logistica.
      OR (
        v_es_logistica
        AND (
          (
            OLD.estado = 'listo_despacho'::public.pedido_estado
            AND NEW.estado = 'en_ruta'::public.pedido_estado
          )
          OR
          (
            OLD.estado = 'en_ruta'::public.pedido_estado
            AND NEW.estado = 'entregado'::public.pedido_estado
          )
        )
      )
    ) THEN
      RAISE EXCEPTION
        'Transicion de estado no autorizada: % -> %',
        OLD.estado, NEW.estado
        USING ERRCODE = '42501';
    END IF;
  END IF;


  RETURN NEW;
END;
$$;


COMMENT ON FUNCTION public.pedidos_vendedor_update_guard() IS
  'Protege columnas y transiciones de pedidos para vendedores no administradores.';


-- ============================================================================
-- Activacion idempotente de triggers
-- ============================================================================


DROP TRIGGER IF EXISTS trg_clientes_00_vendedor_update_guard
  ON public.clientes;


CREATE TRIGGER trg_clientes_00_vendedor_update_guard
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.clientes_vendedor_update_guard();


COMMENT ON TRIGGER trg_clientes_00_vendedor_update_guard
  ON public.clientes IS
  'Se ejecuta antes de trg_clientes_bu_identidad.';


DROP TRIGGER IF EXISTS trg_pedido_00_vendedor_update_guard
  ON public.pedidos;


CREATE TRIGGER trg_pedido_00_vendedor_update_guard
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.pedidos_vendedor_update_guard();


COMMENT ON TRIGGER trg_pedido_00_vendedor_update_guard
  ON public.pedidos IS
  'Se ejecuta antes de los triggers de stock, logistica y updated_at.';


DROP TRIGGER IF EXISTS trg_pedido_items_90_recalcular_total
  ON public.pedido_items;


CREATE TRIGGER trg_pedido_items_90_recalcular_total
AFTER INSERT OR UPDATE OR DELETE ON public.pedido_items
FOR EACH ROW
EXECUTE FUNCTION public.pedido_items_recalcular_total();


COMMENT ON TRIGGER trg_pedido_items_90_recalcular_total
  ON public.pedido_items IS
  'Recalcula solamente los pedidos afectados por el cambio de items.';


-- Las funciones son internas y no forman parte de la API RPC.
REVOKE ALL ON FUNCTION public.clientes_vendedor_update_guard()
  FROM PUBLIC, anon, authenticated;


REVOKE ALL ON FUNCTION public.pedidos_vendedor_update_guard()
  FROM PUBLIC, anon, authenticated;


REVOKE ALL ON FUNCTION public.pedido_items_recalcular_total()
  FROM PUBLIC, anon, authenticated;
