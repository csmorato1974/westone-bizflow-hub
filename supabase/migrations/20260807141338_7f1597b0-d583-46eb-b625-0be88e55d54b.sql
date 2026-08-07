DROP POLICY IF EXISTS ecr_update_self_reenvio ON public.email_change_requests;

CREATE OR REPLACE FUNCTION public.ecr_bloquear_cambios_sensibles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por
     OR NEW.email_nuevo IS DISTINCT FROM OLD.email_nuevo
     OR NEW.email_anterior IS DISTINCT FROM OLD.email_anterior
     OR NEW.cerrado_en IS DISTINCT FROM OLD.cerrado_en THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar una solicitud de cambio de email';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.clientes_ai_auditoria() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clientes_ai_auditoria() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clientes_au_auditoria() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clientes_au_auditoria() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clientes_nuevo_codigo() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clientes_nuevo_codigo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clientes_sync_codigo_seq(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clientes_sync_codigo_seq(bigint) FROM PUBLIC;