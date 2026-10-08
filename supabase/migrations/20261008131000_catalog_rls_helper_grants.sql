-- P0 canonicalization: harden EXECUTE grants for SECURITY DEFINER helpers
-- used exclusively by authenticated catalog RLS policies.
-- Keep historical migration 20260925145000 immutable.

REVOKE ALL ON FUNCTION public.es_personal_interno()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_personal_interno()
  TO authenticated;

REVOKE ALL ON FUNCTION public.cliente_lista_precio_actual()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cliente_lista_precio_actual()
  TO authenticated;

REVOKE ALL ON FUNCTION public.cliente_puede_ver_producto(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cliente_puede_ver_producto(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cliente_puede_ver_variante(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cliente_puede_ver_variante(uuid)
  TO authenticated;
