-- 1) notificaciones: vendedor/cliente solo pueden crear notificaciones para si mismos
DROP POLICY IF EXISTS notif_insert_scoped ON public.notificaciones;
CREATE POLICY notif_insert_scoped ON public.notificaciones
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR user_id = auth.uid());

-- 2) email_change_requests: el solicitante no puede cambiar el estado de su propia solicitud
DROP POLICY IF EXISTS ecr_update ON public.email_change_requests;

CREATE POLICY ecr_update_admin ON public.email_change_requests
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY ecr_update_self_reenvio ON public.email_change_requests
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND estado = 'pendiente')
WITH CHECK (user_id = auth.uid() AND estado = 'pendiente');

CREATE OR REPLACE FUNCTION public.ecr_bloquear_cambios_sensibles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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
    RAISE EXCEPTION 'Solo un administrador puede modificar el estado de una solicitud de cambio de email';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ecr_bloquear_cambios_sensibles ON public.email_change_requests;
CREATE TRIGGER trg_ecr_bloquear_cambios_sensibles
BEFORE UPDATE ON public.email_change_requests
FOR EACH ROW EXECUTE FUNCTION public.ecr_bloquear_cambios_sensibles();

-- 3) SECURITY DEFINER: quitar EXECUTE a PUBLIC/anon; conceder solo a quien lo necesita
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- helpers usados por politicas RLS (deben seguir ejecutables por usuarios autenticados)
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_de_usuario(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_de_vendedor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_de_vendedor_por_perfil(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_tiene_pedido_despacho(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_vendedor_de_usuario(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_pedido(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_editar_pedido(uuid, uuid) TO authenticated;

-- RPC de app: cada una valida autorizacion internamente
GRANT EXECUTE ON FUNCTION public.cliente_estadisticas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_ventas(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_mi_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.username_disponible(text) TO authenticated;