-- STAGING: confirmación manual del WhatsApp del cliente antes del onboarding.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS whatsapp_confirmado_en timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_confirmado_por uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.clientes.whatsapp_confirmado_en IS 'Confirmación manual de que el celular corresponde al cliente (no se infiere al abrir WhatsApp).';

-- Si cambia el celular, la confirmación previa deja de ser válida.
CREATE OR REPLACE FUNCTION public.clientes_bu_invalidar_whatsapp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.celular IS DISTINCT FROM OLD.celular
     AND NEW.whatsapp_confirmado_en IS NOT DISTINCT FROM OLD.whatsapp_confirmado_en THEN
    NEW.whatsapp_confirmado_en := NULL;
    NEW.whatsapp_confirmado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clientes_bu_invalidar_whatsapp ON public.clientes;
CREATE TRIGGER trg_clientes_bu_invalidar_whatsapp
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_bu_invalidar_whatsapp();

CREATE OR REPLACE FUNCTION public.clientes_vendedor_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_columnas_permitidas constant text[] := ARRAY[
    'contacto','celular','telefono_normalizado','direccion','ciudad','notas',
    'latitud','longitud','precision_metros','gps_capturado_en','gps_capturado_por','gps_verificado',
    'onboarding_enviado_en','onboarding_canal','onboarding_enviado_por',
    'whatsapp_confirmado_en','whatsapp_confirmado_por'
  ]::text[];
BEGIN
  IF v_uid IS NULL
     OR public.is_admin(v_uid)
     OR NOT public.has_role(v_uid, 'vendedor'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_columnas_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_columnas_permitidas) THEN
    RAISE EXCEPTION 'El vendedor solo puede modificar datos operativos del cliente' USING ERRCODE = '42501';
  END IF;

  IF (NEW.latitud IS DISTINCT FROM OLD.latitud OR NEW.longitud IS DISTINCT FROM OLD.longitud
      OR NEW.precision_metros IS DISTINCT FROM OLD.precision_metros OR NEW.gps_capturado_en IS DISTINCT FROM OLD.gps_capturado_en
      OR NEW.gps_capturado_por IS DISTINCT FROM OLD.gps_capturado_por OR NEW.gps_verificado IS DISTINCT FROM OLD.gps_verificado)
     AND NEW.gps_capturado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'La captura GPS debe quedar atribuida al vendedor autenticado' USING ERRCODE = '42501';
  END IF;

  IF (NEW.onboarding_enviado_en IS DISTINCT FROM OLD.onboarding_enviado_en
      OR NEW.onboarding_canal IS DISTINCT FROM OLD.onboarding_canal
      OR NEW.onboarding_enviado_por IS DISTINCT FROM OLD.onboarding_enviado_por)
     AND NEW.onboarding_enviado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'El onboarding debe quedar atribuido al vendedor autenticado' USING ERRCODE = '42501';
  END IF;

  IF NEW.whatsapp_confirmado_en IS NOT NULL
     AND (NEW.whatsapp_confirmado_en IS DISTINCT FROM OLD.whatsapp_confirmado_en
          OR NEW.whatsapp_confirmado_por IS DISTINCT FROM OLD.whatsapp_confirmado_por)
     AND NEW.whatsapp_confirmado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'La confirmación de WhatsApp debe quedar atribuida al vendedor autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clientes_vendedor_update_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clientes_bu_invalidar_whatsapp() FROM PUBLIC, anon, authenticated;