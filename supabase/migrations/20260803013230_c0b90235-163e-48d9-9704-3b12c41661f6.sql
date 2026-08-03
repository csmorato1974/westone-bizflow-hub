-- ============ 1. PRE-CHEQUEO DE COMPATIBILIDAD ============
DO $$
DECLARE
  v_tel int;
  v_key int;
BEGIN
  SELECT count(*) INTO v_tel FROM (
    SELECT telefono_normalizado FROM public.clientes
    WHERE coalesce(telefono_normalizado,'') <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) t;

  SELECT count(*) INTO v_key FROM (
    SELECT external_import_key FROM public.clientes
    WHERE coalesce(external_import_key,'') <> ''
    GROUP BY 1 HAVING count(*) > 1
  ) k;

  IF v_tel > 0 OR v_key > 0 THEN
    RAISE EXCEPTION
      'Pre-chequeo fallido: % telefonos duplicados y % claves de importacion duplicadas. Consolidar antes de aplicar indices unicos.',
      v_tel, v_key;
  END IF;
END $$;

-- ============ 2. INDICES UNICOS PARCIALES ============
CREATE UNIQUE INDEX IF NOT EXISTS clientes_telefono_normalizado_uniq
  ON public.clientes (telefono_normalizado)
  WHERE telefono_normalizado IS NOT NULL AND telefono_normalizado <> '';

CREATE UNIQUE INDEX IF NOT EXISTS clientes_external_import_key_uniq
  ON public.clientes (external_import_key)
  WHERE external_import_key IS NOT NULL AND external_import_key <> '';

-- ============ 3. BLINDAJE DE ROLES ADMINISTRATIVOS ============
CREATE OR REPLACE FUNCTION public.es_cuenta_administrativa(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.es_cuenta_administrativa(uuid) FROM anon, authenticated;

-- Bloquea el borrado del perfil de una cuenta administrativa desde procesos
-- automaticos (service_role / purga, donde auth.uid() es NULL).
CREATE OR REPLACE FUNCTION public.proteger_perfil_administrativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.es_cuenta_administrativa(OLD.id) AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Cuenta administrativa protegida: no se puede eliminar el perfil % en un proceso automatico', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_perfil_administrativo ON public.profiles;
CREATE TRIGGER trg_proteger_perfil_administrativo
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_administrativo();

-- Bloquea la eliminacion de roles admin/super_admin salvo que la accion la
-- ejecute un super_admin autenticado desde la aplicacion.
CREATE OR REPLACE FUNCTION public.proteger_rol_administrativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IN ('admin','super_admin') THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'Rol administrativo protegido: solo un super_admin autenticado puede quitar el rol % de la cuenta %', OLD.role, OLD.user_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_rol_administrativo ON public.user_roles;
CREATE TRIGGER trg_proteger_rol_administrativo
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_rol_administrativo();