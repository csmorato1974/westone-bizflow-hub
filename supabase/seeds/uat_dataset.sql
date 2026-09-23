-- =====================================================================
-- STAGING/UAT ONLY — WESTONE
-- Dataset UAT reproducible e idempotente (bootstrap).
--
-- NO es una migración. NO se ejecuta automáticamente.
-- Ejecución MANUAL y EXCLUSIVA en el backend de STAGING.
-- PROHIBIDO ejecutar en producción.
--
-- Claves naturales usadas (estables):
--   productos.sku                         (UNIQUE)
--   producto_variantes(producto_id, presentacion)  (UNIQUE)
--   variante_stock.variante_id            (UNIQUE)
--   lista_precio_variante_items(lista_id, variante_id) (UNIQUE)
--   listas_precios.nombre                 (NO es UNIQUE en el esquema:
--                                          se resuelve con SELECT ... LIMIT 1
--                                          + INSERT condicional)
--
-- Idempotencia: cada bloque inserta solo lo que falta y, cuando existe,
-- actualiza únicamente atributos descriptivos. El stock NO se sobreescribe
-- si ya existe la fila (ver bloque 3 y el reset opcional al final).
-- No borra ni modifica datos ajenos, clientes ni pedidos.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Productos UAT (upsert por SKU)
-- ---------------------------------------------------------------------
INSERT INTO public.productos (sku, nombre, linea, descripcion, activo)
VALUES
  ('UAT-REF-001', 'UAT Refrigerante Azul', 'refrigerante', 'STAGING/UAT ONLY', true),
  ('UAT-DEF-001', 'UAT DEF Prueba',        'def',          'STAGING/UAT ONLY', true)
ON CONFLICT (sku) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      linea  = EXCLUDED.linea,
      activo = true;

-- ---------------------------------------------------------------------
-- 2) Variantes UAT (upsert por producto_id + presentacion)
-- ---------------------------------------------------------------------
WITH objetivo(producto_sku, presentacion, sku_variante, orden) AS (
  VALUES
    ('UAT-REF-001', '1L',  'UAT-REF-001-1L',  1),
    ('UAT-REF-001', '4L',  'UAT-REF-001-4L',  2),
    ('UAT-DEF-001', '10L', 'UAT-DEF-001-10L', 1)
)
INSERT INTO public.producto_variantes (producto_id, presentacion, sku_variante, activa, orden)
SELECT p.id, o.presentacion, o.sku_variante, true, o.orden
FROM objetivo o
JOIN public.productos p ON p.sku = o.producto_sku
ON CONFLICT (producto_id, presentacion) DO UPDATE
  SET sku_variante = EXCLUDED.sku_variante,
      activa       = true,
      orden        = EXCLUDED.orden;

-- ---------------------------------------------------------------------
-- 3) Stock inicial UAT (BOOTSTRAP: solo crea filas faltantes)
--    Si la fila de stock ya existe, NO se toca: puede tener actividad
--    real de pruebas (reservas/consumos). Para forzar valores, usar el
--    bloque "RESET UAT" comentado al final.
-- ---------------------------------------------------------------------
WITH objetivo(sku_variante, cantidad) AS (
  VALUES
    ('UAT-REF-001-1L',  100),
    ('UAT-REF-001-4L',   40),
    ('UAT-DEF-001-10L',  30)
)
INSERT INTO public.variante_stock (variante_id, cantidad)
SELECT v.id, o.cantidad
FROM objetivo o
JOIN public.producto_variantes v ON v.sku_variante = o.sku_variante
ON CONFLICT (variante_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Lista de precios "UAT Lista Base"
--    nombre no es UNIQUE => insert condicional (no duplica en reejecución)
-- ---------------------------------------------------------------------
INSERT INTO public.listas_precios (nombre, descripcion, activa)
SELECT 'UAT Lista Base', 'STAGING/UAT ONLY', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.listas_precios WHERE nombre = 'UAT Lista Base'
);

UPDATE public.listas_precios
   SET activa = true
 WHERE nombre = 'UAT Lista Base'
   AND activa IS DISTINCT FROM true;

-- ---------------------------------------------------------------------
-- 5) Precios UAT por variante (upsert por lista_id + variante_id)
-- ---------------------------------------------------------------------
WITH lista AS (
  SELECT id FROM public.listas_precios
   WHERE nombre = 'UAT Lista Base'
   ORDER BY created_at
   LIMIT 1
), objetivo(sku_variante, precio) AS (
  VALUES
    ('UAT-REF-001-1L',  22.00),
    ('UAT-REF-001-4L',  75.00),
    ('UAT-DEF-001-10L', 95.00)
)
INSERT INTO public.lista_precio_variante_items (lista_id, variante_id, precio)
SELECT l.id, v.id, o.precio
FROM objetivo o
JOIN public.producto_variantes v ON v.sku_variante = o.sku_variante
CROSS JOIN lista l
ON CONFLICT (lista_id, variante_id) DO UPDATE
  SET precio = EXCLUDED.precio;

COMMIT;

-- =====================================================================
-- RESET UAT — OPCIONAL, DESTRUCTIVO SOBRE FILAS UAT, DESACTIVADO.
-- STAGING/UAT ONLY. Descomentar y ejecutar a mano SOLO si se quiere
-- volver al stock inicial de UAT (pierde reservas/consumos de prueba).
-- No toca clientes, pedidos ni productos ajenos.
-- ---------------------------------------------------------------------
-- BEGIN;
-- WITH objetivo(sku_variante, cantidad) AS (
--   VALUES
--     ('UAT-REF-001-1L',  100),
--     ('UAT-REF-001-4L',   40),
--     ('UAT-DEF-001-10L',  30)
-- )
-- UPDATE public.variante_stock s
--    SET cantidad = o.cantidad,
--        reservado = 0
--   FROM objetivo o
--   JOIN public.producto_variantes v ON v.sku_variante = o.sku_variante
--  WHERE s.variante_id = v.id;
-- COMMIT;
-- =====================================================================
