

# Arreglar "Agotado" en catálogo y agregar imágenes de producto

## Problema raíz
1. **Todo aparece "Agotado"**: el catálogo embebe `productos(...stock(cantidad))` vía PostgREST, pero las tablas `productos` y `stock` no tienen foreign key declarada. Sin FK, el embed devuelve vacío y el stock se lee como `0`. Confirmado en BD: todos los productos tienen 100 unidades reales.
2. **Sin imágenes**: la columna `productos.imagen_url` existe pero está vacía en los 14 productos, y no hay UI para subir imágenes ni bucket de Storage configurado.

## Cambios

### 1. Crear FK `stock.producto_id → productos.id` (migración)
Permite que PostgREST resuelva el embed correctamente. Además agrego `ON DELETE CASCADE` para mantener integridad. También añado FKs faltantes en `lista_precio_items`, `pedido_items`, `pedidos.cliente_id`, `clientes.lista_precio_id`, `clientes.vendedor_id`, `clientes.user_id` para evitar problemas similares en otras pantallas.

### 2. Hacer el catálogo robusto a embeds vacíos (`src/pages/cliente/Catalogo.tsx`)
Como capa de seguridad, si `stock` no llega en el embed, hacer una segunda consulta a `stock` por los `producto_id` y mapear. Así, aunque la FK tarde en propagarse o falle el embed, el stock siempre se carga. También mostrar imagen del producto si existe.

### 3. Crear bucket de Storage `productos` y agregar UI de carga de imagen
- Migración: crear bucket público `productos` con políticas (lectura pública, escritura solo admin).
- En `src/pages/admin/Productos.tsx`: añadir input de archivo en el formulario crear/editar producto. Sube a Storage, guarda la URL pública en `productos.imagen_url`. Mostrar miniatura en la tabla.

### 4. Mostrar imagen en el catálogo cliente
En cada `Card` de producto, si `imagen_url` existe mostrar la imagen arriba (aspect-ratio cuadrado, `object-cover`); si no, mostrar un placeholder con la inicial del producto sobre fondo `bg-muted`.

## Archivos a editar
- `src/pages/cliente/Catalogo.tsx` (lectura de stock + render imagen)
- `src/pages/admin/Productos.tsx` (uploader de imagen + miniatura)
- Migraciones: FKs faltantes + bucket `productos` con políticas RLS

## Resultado esperado
- Catálogo muestra "Stock: 100" en verde para los 14 productos.
- Admin puede subir foto a cada producto y se ve en el catálogo del cliente.
- Sin foto → placeholder limpio en vez de hueco.

