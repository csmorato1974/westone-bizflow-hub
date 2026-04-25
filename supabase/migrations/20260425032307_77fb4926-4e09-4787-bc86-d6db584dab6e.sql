-- =========================================================
-- 1. Tabla producto_variantes
-- =========================================================
CREATE TABLE public.producto_variantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  presentacion text NOT NULL,
  sku_variante text,
  activa boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, presentacion)
);

CREATE INDEX idx_producto_variantes_producto ON public.producto_variantes(producto_id);

ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variantes_view_auth" ON public.producto_variantes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "variantes_admin" ON public.producto_variantes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_variantes_updated_at
  BEFORE UPDATE ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 2. Tabla variante_stock
-- =========================================================
CREATE TABLE public.variante_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variante_id uuid NOT NULL UNIQUE REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  cantidad integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variante_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vstock_view_auth" ON public.variante_stock
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vstock_admin" ON public.variante_stock
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_vstock_updated_at
  BEFORE UPDATE ON public.variante_stock
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER TABLE public.variante_stock REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.variante_stock;

-- =========================================================
-- 3. Tabla lista_precio_variante_items
-- =========================================================
CREATE TABLE public.lista_precio_variante_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id uuid NOT NULL REFERENCES public.listas_precios(id) ON DELETE CASCADE,
  variante_id uuid NOT NULL REFERENCES public.producto_variantes(id) ON DELETE CASCADE,
  precio numeric NOT NULL,
  UNIQUE (lista_id, variante_id)
);

CREATE INDEX idx_lpvi_lista ON public.lista_precio_variante_items(lista_id);
CREATE INDEX idx_lpvi_variante ON public.lista_precio_variante_items(variante_id);

ALTER TABLE public.lista_precio_variante_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpvi_view_auth" ON public.lista_precio_variante_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lpvi_admin" ON public.lista_precio_variante_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- 4. Ampliar pedido_items con variante_id y presentacion
-- =========================================================
ALTER TABLE public.pedido_items
  ADD COLUMN variante_id uuid REFERENCES public.producto_variantes(id) ON DELETE SET NULL,
  ADD COLUMN presentacion text;

CREATE INDEX idx_pedido_items_variante ON public.pedido_items(variante_id);

-- =========================================================
-- 5. Backfill: crear variantes desde productos.presentaciones
-- =========================================================
-- 5a. Productos CON presentaciones -> una variante por cada presentación
INSERT INTO public.producto_variantes (producto_id, presentacion, orden)
SELECT
  p.id,
  TRIM(pres.value) AS presentacion,
  pres.ord
FROM public.productos p
CROSS JOIN LATERAL unnest(p.presentaciones) WITH ORDINALITY AS pres(value, ord)
WHERE p.presentaciones IS NOT NULL
  AND array_length(p.presentaciones, 1) > 0
  AND TRIM(pres.value) <> ''
ON CONFLICT (producto_id, presentacion) DO NOTHING;

-- 5b. Productos SIN presentaciones -> una variante "Estándar"
INSERT INTO public.producto_variantes (producto_id, presentacion, orden)
SELECT p.id, 'Estándar', 0
FROM public.productos p
WHERE p.presentaciones IS NULL OR array_length(p.presentaciones, 1) IS NULL OR array_length(p.presentaciones, 1) = 0
ON CONFLICT (producto_id, presentacion) DO NOTHING;

-- 5c. Backfill variante_stock: copiar stock actual a la primera variante (orden ASC)
INSERT INTO public.variante_stock (variante_id, cantidad)
SELECT DISTINCT ON (v.producto_id)
  v.id,
  COALESCE(s.cantidad, 0)
FROM public.producto_variantes v
LEFT JOIN public.stock s ON s.producto_id = v.producto_id
ORDER BY v.producto_id, v.orden ASC, v.created_at ASC
ON CONFLICT (variante_id) DO NOTHING;

-- Crear filas en 0 para todas las demás variantes
INSERT INTO public.variante_stock (variante_id, cantidad)
SELECT v.id, 0
FROM public.producto_variantes v
WHERE NOT EXISTS (SELECT 1 FROM public.variante_stock vs WHERE vs.variante_id = v.id);

-- 5d. Backfill lista_precio_variante_items desde lista_precio_items
INSERT INTO public.lista_precio_variante_items (lista_id, variante_id, precio)
SELECT lpi.lista_id, v.id, lpi.precio
FROM public.lista_precio_items lpi
JOIN public.producto_variantes v ON v.producto_id = lpi.producto_id
ON CONFLICT (lista_id, variante_id) DO NOTHING;

-- 5e. Backfill pedido_items: asignar la primera variante del producto a líneas existentes
WITH primera_variante AS (
  SELECT DISTINCT ON (producto_id) producto_id, id, presentacion
  FROM public.producto_variantes
  ORDER BY producto_id, orden ASC, created_at ASC
)
UPDATE public.pedido_items pi
SET variante_id = pv.id,
    presentacion = pv.presentacion
FROM primera_variante pv
WHERE pi.producto_id = pv.producto_id
  AND pi.variante_id IS NULL;