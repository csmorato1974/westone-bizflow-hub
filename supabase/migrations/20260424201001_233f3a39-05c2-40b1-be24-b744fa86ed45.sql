-- 1) Limpiar user_id de clientes que apunta a usuarios sin rol 'cliente'
UPDATE public.clientes
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = clientes.user_id AND ur.role = 'cliente'
  );

-- 2) Habilitar Realtime para clientes
ALTER TABLE public.clientes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;