# Fase 2 — Importación de Pedidos Históricos

Módulo exclusivo de admin/super admin para cargar las 511 líneas de la hoja `CSV_Pedidos_Historicos` como pedidos históricos, con dry-run obligatorio y confirmación explícita. Sin ninguna notificación a clientes.

## Flujo

1. **Carga**: pegar el CSV o subir el archivo (CSV/Excel), igual que en la importación de clientes. Detección de columnas: `fila_venta, fecha, id_unificado, estado_coincide, ciudad, zona, direccion, nombre, nombre_tienda, contacto, celular, producto, cantidad, total_venta_bs, incluir`.
2. **Dry-run (siempre primero)**, con resumen y pestañas:
   - **A crear**: pedidos agrupados por `fila_venta + fecha + id_unificado`, con sus líneas, cliente vinculado (empresa real) y total.
   - **Pendiente de revisión**: las filas `incluir=NO` (39) — nunca se importan; se listan con su motivo (`estado_coincide`).
   - **Errores**: filas `incluir=SI` cuyo `id_unificado` no existe en clientes, o con fecha/cantidad/total inválidos.
   - **Productos sin reconocer**: cada texto distinto de `producto` que no se pudo mapear, con un selector para asignarlo a un producto del catálogo (y presentación si aplica). Mientras queden textos sin asignar, esas líneas cuentan como error.
3. **Confirmar importación** (botón explícito): recién ahí se escriben los pedidos. Idempotente: si se vuelve a correr el mismo archivo, los pedidos ya importados se omiten (no se duplican).
4. **Auditoría**: un registro de importación con fecha, usuario admin, pedidos creados, líneas creadas, errores y pendientes; visible en el reporte posterior.
5. **Ficha de cliente**: los pedidos históricos aparecen en el historial de actividad del cliente y en el listado de Pedidos, marcados como históricos.

## Reglas de datos (confirmadas)

- Vinculación de cliente: `id_unificado` (CLI-XXXX) contra `codigo_cliente_externo` de clientes (503 de 526 clientes ya lo tienen).
- Estado del pedido importado: **entregado**.
- Precio unitario = `total_venta_bs / cantidad`; total del pedido = suma de las líneas.
- Producto: texto libre. Coincidencia aproximada (normalizando acentos/mayúsculas) contra nombre, SKU y presentaciones del catálogo; lo que no coincida se resuelve a mano en el dry-run.
- Sin envío de emails, WhatsApp ni notificaciones internas.

## Detalles técnicos

- **Migración**: columnas nuevas en `pedidos` — `origen_importacion text`, `import_batch_id uuid`, `import_row_key text` (índice único parcial para idempotencia), y `fecha_historica` no hace falta: se usa `created_at` con la fecha del CSV. Tabla `import_pedidos_batches` (usuario, archivo, totales, detalle jsonb) con GRANTs y RLS solo para admin/super admin; reutilizo `audit_logs` para el evento `import_pedidos`.
- **Edge function** `import-pedidos` con dos modos (`dry_run`, `commit`), procesamiento por lotes de ~20 pedidos por llamada para evitar timeouts, service role para insertar `pedidos` + `pedido_items` con `creado_por` = admin.
- **Frontend**: `src/pages/admin/ImportarPedidos.tsx` (nueva ruta admin en sidebar), parseo con SheetJS reutilizando el patrón de `src/lib/importClientes.ts`, y `src/lib/importPedidos.ts` con normalización, agrupación y mapeo de productos.
- **Ficha de cliente**: el historial existente de pedidos ya filtra por `cliente_id`, así que solo se añade la etiqueta "Histórico" cuando `origen_importacion` está seteado.
