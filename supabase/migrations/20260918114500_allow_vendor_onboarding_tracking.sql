-- Permite al vendedor registrar el seguimiento operativo del onboarding
-- sin abrir campos sensibles de identidad, asignación, precio o estado del cliente.
-- PR #4 permanece inmutable; esta migración es incremental.

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
    'gps_verificado',
    'onboarding_enviado_en',
    'onboarding_canal',
    'onboarding_enviado_por'
  ]::text[];
  v_cambio_gps boolean;
  v_cambio_onboarding boolean;
BEGIN
  IF v_uid IS NULL
     OR public.is_admin(v_uid)
     OR NOT public.has_role(v_uid, 'vendedor'::public.app_role) THEN
    RETURN NEW;
  END IF;

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

  v_cambio_onboarding :=
       NEW.onboarding_enviado_en IS DISTINCT FROM OLD.onboarding_enviado_en
    OR NEW.onboarding_canal IS DISTINCT FROM OLD.onboarding_canal
    OR NEW.onboarding_enviado_por IS DISTINCT FROM OLD.onboarding_enviado_por;

  IF v_cambio_onboarding
     AND NEW.onboarding_enviado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION
      'El onboarding debe quedar atribuido al vendedor autenticado'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.clientes_vendedor_update_guard() IS
  'Limita a vendedores no administradores a campos operativos de clientes, incluido el seguimiento de onboarding.';

REVOKE ALL ON FUNCTION public.clientes_vendedor_update_guard()
  FROM PUBLIC, anon, authenticated;
