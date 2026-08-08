ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS precision_metros numeric,
  ADD COLUMN IF NOT EXISTS gps_capturado_en timestamptz,
  ADD COLUMN IF NOT EXISTS gps_capturado_por uuid,
  ADD COLUMN IF NOT EXISTS gps_verificado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cliente_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  latitud numeric NOT NULL,
  longitud numeric NOT NULL,
  precision_metros numeric,
  capturado_por uuid,
  capturado_en timestamptz NOT NULL DEFAULT now(),
  fuente text NOT NULL DEFAULT 'gps_navegador',
  confirmado boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_ubicaciones_lat_ck CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT cliente_ubicaciones_lng_ck CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT cliente_ubicaciones_prec_ck CHECK (precision_metros IS NULL OR precision_metros > 0)
);

GRANT SELECT, INSERT ON public.cliente_ubicaciones TO authenticated;
GRANT ALL ON public.cliente_ubicaciones TO service_role;

ALTER TABLE public.cliente_ubicaciones ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cliente_ubicaciones_cliente_idx
  ON public.cliente_ubicaciones (cliente_id, capturado_en DESC);
CREATE INDEX IF NOT EXISTS clientes_gps_capturado_en_idx
  ON public.clientes (gps_capturado_en DESC);

CREATE POLICY "cu_select_scoped" ON public.cliente_ubicaciones
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'vendedor'::public.app_role)
        AND public.cliente_de_vendedor(cliente_id, auth.uid()))
    OR public.cliente_de_usuario(cliente_id, auth.uid())
  );

CREATE POLICY "cu_insert_scoped" ON public.cliente_ubicaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    capturado_por = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'vendedor'::public.app_role)
          AND public.cliente_de_vendedor(cliente_id, auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.guardar_ubicacion_cliente(
  _cliente_id uuid,
  _latitud numeric,
  _longitud numeric,
  _precision_metros numeric DEFAULT NULL,
  _fuente text DEFAULT 'gps_navegador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_admin := public.is_admin(v_uid);
  IF NOT v_admin
     AND NOT (public.has_role(v_uid, 'vendedor'::public.app_role)
              AND public.cliente_de_vendedor(_cliente_id, v_uid)) THEN
    RAISE EXCEPTION 'No autorizado para guardar la ubicación de este cliente' USING ERRCODE = '42501';
  END IF;

  IF _latitud IS NULL OR _longitud IS NULL THEN
    RAISE EXCEPTION 'Coordenadas requeridas' USING ERRCODE = '22023';
  END IF;
  IF _latitud < -90 OR _latitud > 90 THEN
    RAISE EXCEPTION 'Latitud fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF _longitud < -180 OR _longitud > 180 THEN
    RAISE EXCEPTION 'Longitud fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF _precision_metros IS NOT NULL AND _precision_metros <= 0 THEN
    RAISE EXCEPTION 'Precisión inválida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cliente_ubicaciones
    (cliente_id, latitud, longitud, precision_metros, capturado_por, fuente, confirmado)
  VALUES
    (_cliente_id, _latitud, _longitud, _precision_metros, v_uid,
     coalesce(nullif(btrim(_fuente), ''), 'gps_navegador'), true)
  RETURNING id INTO v_id;

  UPDATE public.clientes
  SET latitud = _latitud,
      longitud = _longitud,
      precision_metros = _precision_metros,
      gps_capturado_en = now(),
      gps_capturado_por = v_uid,
      gps_verificado = true
  WHERE id = _cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, accion, entidad, entidad_id, detalle)
  VALUES (v_uid, 'capturar_ubicacion_cliente', 'clientes', _cliente_id,
    jsonb_build_object('ubicacion_id', v_id, 'latitud', _latitud, 'longitud', _longitud,
                       'precision_metros', _precision_metros, 'fuente', _fuente));

  RETURN jsonb_build_object('guardado', true, 'ubicacion_id', v_id,
    'latitud', _latitud, 'longitud', _longitud, 'precision_metros', _precision_metros,
    'capturado_en', now());
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_ubicacion_cliente(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_ubicacion_cliente(uuid, numeric, numeric, numeric, text) TO authenticated;