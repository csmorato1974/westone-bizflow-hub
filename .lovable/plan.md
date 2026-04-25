## Plan para arreglar el detalle de pedidos y mostrar todos los pedidos realizados

### Objetivo
Hacer que el detalle de los pedidos sí se cargue y se vea correctamente en:
- Perfil del cliente
- Mis Pedidos
- Vista admin por cliente
- Cualquier otra vista que lea `pedido_items` desde `pedidos`

### Problema detectado
El backend tiene dos relaciones entre `pedidos` y `pedido_items`:
- `pedido_items_pedido_id_fkey`
- `pi_pedido_id_fkey`

Por eso las consultas embebidas como `pedido_items(...)` fallan con error de relación ambigua y la interfaz termina mostrando solo las secciones vacías, sin detalle.

### Implementación
1. Crear una migración para eliminar la relación duplicada que no corresponde:
   - quitar `pi_pedido_id_fkey`
   - quitar también `pi_producto_id_fkey` si sigue duplicando la relación normal con `productos`

2. Corregir las consultas del frontend para que dejen de depender de la relación ambigua:
   - actualizar `src/components/cliente/PedidosRecientes.tsx`
   - actualizar `src/pages/cliente/MisPedidos.tsx`
   - actualizar `src/pages/admin/Pedidos.tsx`
   - actualizar `src/pages/logistica/Logistica.tsx`
   - usar relación explícita en los `select`, por ejemplo `pedido_items!pedido_items_pedido_id_fkey(...)`

3. Mantener visible el detalle completo de todos los pedidos:
   - en Perfil: pedidos recientes con desglose por producto
   - en Mis Pedidos: historial completo con detalle expandible por pedido
   - en Admin > Clientes: modal con historial completo del cliente
   - en Admin > Pedidos y Logística: asegurar que los ítems sigan cargando sin romperse

4. Añadir manejo visual de error/carga más claro:
   - si la consulta falla, mostrar mensaje útil en vez de dejar secciones aparentemente vacías
   - conservar realtime donde ya existe

5. Validar el resultado:
   - confirmar que el admin pueda abrir “Ver pedidos” y ver todos los ítems
   - confirmar que una cuenta cliente vinculada vea sus pedidos en Perfil y Mis Pedidos
   - confirmar que ya no aparezca el error de relación ambigua en las peticiones

### Detalles técnicos
- La causa no es que falten pedidos, sino que la consulta REST falla con `PGRST201` por relaciones duplicadas.
- Se detectó en red este error:
  `Could not embed because more than one relationship was found for 'pedidos' and 'pedido_items'`
- La tabla `pedido_items` tiene actualmente FKs duplicadas hacia `pedidos` y `productos`.
- Aunque la migración eliminará la duplicidad, también dejaré las consultas con join explícito para que la app sea robusta incluso mientras se sincronizan los tipos.

### Resultado esperado
Al aprobar, dejaré funcionando la visualización del detalle de todos los pedidos realizados, tanto para clientes como para administración, sin secciones vacías ni consultas rotas.