# Cambio de presentación 4L → 5L

## Alcance

Voy a reemplazar **todas** las apariciones de la presentación "4L" por "5L" en la base de datos y en el único placeholder del código que la menciona.

## Lo que se va a cambiar

### 1. Base de datos (migración SQL)

**Tabla `productos.presentaciones`** (array de texto) — 10 productos afectados:
- Ultra Antifreeze Blue, Ultra Antifreeze Pink, Supercoolant Racing, Radiator-X, Supercoolant Red, Antifreeze Green, Car-X, Clear-X, Antifreeze Red, Supercoolant Green
- Se reemplaza el elemento `'4L'` del array por `'5L'` (manteniendo `1L` y `20L` donde existan).

**Tabla `producto_variantes.presentacion`** — 10 variantes activas afectadas (una por cada producto de arriba):
- `UPDATE ... SET presentacion = '5L' WHERE presentacion = '4L'`
- Esto preserva el `id` de la variante, por lo que **no se rompen** los vínculos con `lista_precio_variante_items` (precios) ni con `variante_stock` (inventario). Los precios y stock asociados al envase de 4L pasan automáticamente a ser los del 5L.

**Tabla `pedido_items.presentacion`** — 1 ítem histórico afectado:
- Se actualiza para que el histórico de pedidos refleje la nueva nomenclatura.

### 2. Código frontend

**`src/pages/admin/Productos.tsx`** (línea 220):
- Cambiar el `placeholder` del input de presentación de `"ej. 1L, 4L, 20L"` a `"ej. 1L, 5L, 20L"`.

## Lo que NO cambia

- IDs de variantes, productos, precios y stock se preservan.
- Listas de precios y cantidades en stock no se tocan: como están atadas a `variante_id`, automáticamente quedan asociadas a "5L".
- No hay otras referencias hard-codeadas a "4L" en el código (los `L` encontrados en SVGs son comandos de path, no etiquetas de presentación).

## Verificación posterior

Tras aplicar la migración, consultaré:
- `SELECT ... WHERE '4L' = ANY(presentaciones)` en productos → debe devolver 0 filas.
- `SELECT ... WHERE presentacion = '4L'` en `producto_variantes` y `pedido_items` → debe devolver 0 filas.
- Confirmaré que precios y stock siguen vinculados a las variantes ahora etiquetadas como "5L".
