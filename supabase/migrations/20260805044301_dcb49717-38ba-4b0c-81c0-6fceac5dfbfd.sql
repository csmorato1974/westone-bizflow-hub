REVOKE ALL ON FUNCTION public.clientes_bi_identidad() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.clientes_bu_identidad() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fnv1a_hex(text) FROM anon;
REVOKE ALL ON FUNCTION public.clientes_import_key(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.normalizar_telefono(text) FROM anon;
REVOKE ALL ON FUNCTION public.validar_identidad_cliente(text, text, text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.corregir_codigo_cliente(uuid, text, text) FROM anon;