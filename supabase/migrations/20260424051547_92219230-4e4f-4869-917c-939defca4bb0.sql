-- Foreign keys faltantes (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lpi_lista_id_fkey') THEN
    ALTER TABLE public.lista_precio_items ADD CONSTRAINT lpi_lista_id_fkey
      FOREIGN KEY (lista_id) REFERENCES public.listas_precios(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lpi_producto_id_fkey') THEN
    ALTER TABLE public.lista_precio_items ADD CONSTRAINT lpi_producto_id_fkey
      FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pi_pedido_id_fkey') THEN
    ALTER TABLE public.pedido_items ADD CONSTRAINT pi_pedido_id_fkey
      FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pi_producto_id_fkey') THEN
    ALTER TABLE public.pedido_items ADD CONSTRAINT pi_producto_id_fkey
      FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_cliente_id_fkey') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_lista_precio_id_fkey') THEN
    ALTER TABLE public.clientes ADD CONSTRAINT clientes_lista_precio_id_fkey
      FOREIGN KEY (lista_precio_id) REFERENCES public.listas_precios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Bucket público para imágenes de productos
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas (drop si existen, luego crear)
DROP POLICY IF EXISTS "productos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "productos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "productos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "productos_admin_delete" ON storage.objects;

CREATE POLICY "productos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'productos');

CREATE POLICY "productos_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'productos' AND public.is_admin(auth.uid()));

CREATE POLICY "productos_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'productos' AND public.is_admin(auth.uid()));

CREATE POLICY "productos_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'productos' AND public.is_admin(auth.uid()));