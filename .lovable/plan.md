# Identidad y conciliación centralizada de clientes

## Estado verificado

- 527 clientes: 503 con `CLI-####`, 23 con códigos heredados `VTA-####`, 1 sin código (Calberto Solmo).
- Mayor correlativo CLI: 515 → próximo disponible 516.
- Sin códigos duplicados, incluso normalizando mayúsculas y espacios.
- 21 clientes sin teléfono utilizable (celular `—`).
- 1 cliente sin `external_import_key` (Calberto Solmo).
- Todos tienen ciudad. `origen_registro` todavía no existe.

## 1. Migración de base de datos

**Secuencia** `public.clientes_codigo_seq`, con el próximo valor en 516. Formato sin truncamiento:
`'CLI-' || lpad(numero::text, greatest(4, length(numero::text)), '0')` → `CLI-0516`, `CLI-9999`, `CLI-10000`. Nunca MAX+1 en altas ordinarias.

**Sincronización**: la secuencia se sincroniza con el mayor CLI al terminar el backfill, y cuando una importación traiga un `CLI-NNNN` explícito mayor al valor actual. Los `VTA-####` no la afectan.

**`public.normalizar_telefono(text)`**: solo dígitos, sin ceros iniciales, `NULL` cuando no queden dígitos; idéntica a `normalizePhone`.

**`public.clientes_import_key(...)`**: réplica exacta de `buildImportKey` + `stableHash` (FNV-1a), con prioridad teléfono ≥7 dígitos → correo real → empresa normalizada + dirección → `NULL`. Se genera solo cuando está vacía; una vez asignada no se recalcula.

**`origen_registro text NOT NULL DEFAULT 'manual'`** con CHECK sobre `manual`, `importacion`, `autorregistro`, `integracion`.

**Triggers separados por responsabilidad**
- `BEFORE INSERT`: normaliza celular, completa `external_import_key` si es posible, asigna CLI cuando el código viene NULL o vacío, conserva un código explícito válido y sincroniza la secuencia si ese código es mayor.
- `BEFORE UPDATE`: recalcula `telefono_normalizado` al cambiar `celular`, completa `external_import_key` si sigue NULL y ya hay datos, e impide la modificación ordinaria de un código existente. La corrección de código pasa por una operación específica de superadministrador, validada y auditada.
- `AFTER INSERT/UPDATE`: registra código asignado, origen, usuario creador cuando esté disponible, fecha, cambios de celular con teléfono normalizado anterior y nuevo, y correcciones autorizadas del código.

Todas las funciones con `search_path` explícito y sin permisos innecesarios sobre la secuencia.

**Índice único normalizado** sobre `lower(btrim(codigo_cliente_externo))`, parcial para códigos no vacíos.

## 2. Backfill

- Códigos solo donde son NULL o vacíos, consumiendo la secuencia → Calberto Solmo recibe `CLI-0516`.
- Los 503 CLI y los 23 VTA quedan intactos.
- `telefono_normalizado` solo cuando el celular tiene dígitos; los 21 con `—` quedan en NULL.
- `external_import_key` solo cuando falta y hay datos suficientes; NULL en lugar de cadena vacía.
- `origen_registro`: `importacion` para los históricos identificados como de lote, `manual` para el resto, documentando que esa clasificación histórica es una inferencia usada solo en este backfill.
- Sincroniza la secuencia al final y reporta filas corregidas y las que siguen requiriendo revisión.

## 3. Formulario administrativo

En `src/pages/admin/Clientes.tsx`: sin generación de código en React, envío de `origen_registro: 'manual'`, y lectura desde el INSERT de `id`, `codigo_cliente_externo`, `telefono_normalizado`, `external_import_key` y `origen_registro`.

- Código visible en la ficha como solo lectura; el administrador común no puede modificarlo.
- La corrección por superadministrador usa una acción específica, no la edición normal.
- Empresa, contacto, celular y ciudad obligatorios; empresa y contacto presentados como conceptos distintos.
- Advertencia de conciliación pendiente cuando el celular no tenga dígitos utilizables.
- Ante código o clave existente, se muestra el cliente en conflicto y se registra el intento rechazado.
- Se revisan todas las rutas con `.from("clientes").insert(...)` para que ninguna omita el origen ni dependa del frontend.

## 4. Importación de clientes

Orden de coincidencia: código normalizado → `external_import_key` → teléfono → correo → nombre y dirección → coincidencia probable a revisión manual.

- Sin código en el archivo: no se fabrica en TypeScript, lo asigna la base y se lee después del INSERT.
- Con código: se conserva si no pertenece a otro cliente. Si pertenece a otro, incidencia `tipo_problema = 'conflicto_codigo_cliente'` (valor nuevo del enum) sin crear, actualizar ni sobrescribir.
- Envía `origen_registro: 'importacion'`; respeta los códigos existentes y nunca los sustituye sin decisión explícita.
- Concurrencia: se repiten las validaciones definitivas entre dry-run y commit; si el estado cambió, la fila se detiene con `conflicto_desde_preview`.

## 5. Importación de pedidos

En `src/lib/importPedidos.ts` y su pantalla, la resolución pasa a ser código normalizado → `external_import_key` → teléfono → correo → mapeo manual. Reconoce `CLI-####` y `VTA-####` sin alterar su valor, manda lo ambiguo a revisión y nunca crea clientes.

## 6. Compatibilidad SQL / TypeScript

Colección compartida de casos: ceros iniciales, prefijos y caracteres no numéricos, celular `—`, teléfono insuficiente, correo real, correo provisional, empresas con tildes y con signos, direcciones vacías, nombres repetidos, Unicode y claves por encima de los límites de entero con signo. Cada caso compara normalización y clave en TypeScript contra SQL, exigiendo coincidencia exacta.

## 7. Pruebas funcionales

Alta manual sin código; dos altas concurrentes; importación con y sin código explícito; código duplicado rechazado; CLI explícito mayor que la secuencia; VTA conservado; cambio de empresa sin tocar el código; cambio de celular con recálculo del teléfono; clave estable tras cambiar el teléfono; cliente sin teléfono utilizable; backfill de Calberto Solmo; pedido histórico vinculado por CLI y por VTA; código superior a 9999 sin truncamiento; admin común sin permiso de corrección; corrección autorizada por superadministrador; reimportación sin duplicar; cambio de diagnóstico entre dry-run y commit; intento de insertar `external_import_key` vacío.

## 8. Informe final

Archivos modificados, migración, funciones, triggers, restricciones e índices creados, valor inicial y final de la secuencia, código asignado a Calberto Solmo, registros corregidos por campo, duplicados encontrados, clientes sin teléfono utilizable, clientes sin clave de conciliación, resultado de cada prueba, incidencias pendientes y las limitaciones conocidas de auditoría para transacciones rechazadas (un INSERT rechazado revierte su propio registro de auditoría, por eso el intento se registra desde la aplicación).

No se elimina, fusiona ni sobrescribe ningún cliente automáticamente.
