## Plan: corregir el guardado visual de stock y la disponibilidad en catálogo

### Qué voy a corregir
1. Ajustar la pantalla **Admin > Stock** para que lea correctamente la cantidad desde `variante_stock` y muestre el valor real después de guardar.
2. Mantener el guardado con `upsert` por `variante_id`, pero reforzar la actualización local para que el cambio se vea inmediato sin depender de una recarga ambigua.
3. Alinear la misma lectura de stock en **Cliente > Catálogo** y **Vendedor > Nuevo Pedido** para que todos consuman la cantidad por variante de forma consistente.

### Hallazgo confirmado
- El guardado **sí llega a la base de datos**.
- La tabla `variante_stock` ya tiene `UNIQUE(variante_id)` y el `POST ... on_conflict=variante_id` devuelve `200`.
- El problema principal está en la **lectura/render**: en `AdminStock` la relación `variante_stock(cantidad)` llega como objeto en la respuesta observada, pero el código la trata como arreglo y por eso termina mostrando `0` en muchos casos, dando la impresión de que no guardó.

### Cambios a implementar
- En `src/pages/admin/Stock.tsx`:
  - normalizar la lectura de `variante_stock` para aceptar objeto o arreglo;
  - extraer `cantidad` con una función segura;
  - conservar inputs controlados y limpiar `edits` al guardar;
  - actualizar el estado local antes de refrescar para que el usuario vea el nuevo stock enseguida.
- En `src/pages/cliente/Catalogo.tsx`:
  - mantener la consulta separada de stock por `variante_id`;
  - revisar el mapeo para que no caiga en `0` cuando la fila existe;
  - confirmar que el badge “Agotado” use la cantidad correcta de la variante seleccionada.
- En `src/pages/vendedor/NuevoPedido.tsx`:
  - aplicar el mismo criterio de lectura consistente de stock por variante.

### Validación
- Probar desde Admin cambiando una cantidad y guardando.
- Confirmar que el valor “Actual” cambia al instante y se mantiene al recargar.
- Confirmar que el mismo producto deja de verse como agotado en catálogo si su variante seleccionada tiene stock.

### Detalles técnicos
- Archivo principal afectado: `src/pages/admin/Stock.tsx`
- Archivos de consistencia: `src/pages/cliente/Catalogo.tsx`, `src/pages/vendedor/NuevoPedido.tsx`
- No hace falta una migración nueva para esta corrección, porque el esquema y RLS ya soportan el `upsert` correctamente.
