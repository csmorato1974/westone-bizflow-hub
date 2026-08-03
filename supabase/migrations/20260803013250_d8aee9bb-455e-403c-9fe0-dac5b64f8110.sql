REVOKE EXECUTE ON FUNCTION public.proteger_perfil_administrativo() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.proteger_rol_administrativo() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.es_cuenta_administrativa(uuid) FROM PUBLIC;