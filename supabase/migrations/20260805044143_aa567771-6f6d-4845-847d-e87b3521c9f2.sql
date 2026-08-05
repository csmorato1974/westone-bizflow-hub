ALTER FUNCTION public.clientes_bi_identidad() SECURITY DEFINER;
ALTER FUNCTION public.clientes_bu_identidad() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.clientes_bi_identidad() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_bu_identidad() FROM PUBLIC;