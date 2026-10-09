-- P0 forward-only ACL cleanup. No function bodies, triggers, RLS or data changes.
-- Trigger-only helpers have no demonstrated direct service_role dependency.
-- Their owners retain execution; existing trigger invocations remain intact.
REVOKE EXECUTE ON FUNCTION public.clientes_bi_ciudad_requerida()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ecr_bloquear_cambios_sensibles()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validar_username()
  FROM PUBLIC, anon, authenticated, service_role;

-- PUBLIC is included defensively to close that inheritance path if present.
-- All other table privileges, including commercial CRUD, remain unchanged.
REVOKE TRUNCATE ON TABLE
  public.clientes,
  public.productos,
  public.producto_variantes,
  public.stock,
  public.variante_stock,
  public.listas_precios,
  public.lista_precio_items,
  public.lista_precio_variante_items,
  public.whatsapp_templates
  FROM PUBLIC, anon, authenticated;
