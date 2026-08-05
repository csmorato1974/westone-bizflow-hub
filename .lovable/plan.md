# Identidad y conciliación centralizada de clientes

## Estado real verificado

- 527 clientes: 503 con código `CLI-####`, 23 con códigos heredados `VTA-####`, 1 sin código (Calberto Solmo).
- Mayor número CLI existente: **515** → la secuencia arranca en 516.
- Sin duplicados de código (ni ignorando mayúsculas/espacios): el índice único se puede crear sin riesgo.
- 21 registros sin `telefono_normalizado` porque su celular es el literal `—` (no hay dígitos): quedarán marcados para conciliación manual, no se inventan datos.
- 1 registro sin `external_import_key` (el mismo Calberto Solmo).
- `origen_registro` todavía no existe en la tabla.
- Todos los registros tienen ciudad.

## Base de datos (una migración)

1. **Secuencia** `clientes_codigo_seq`, inicializada en 516. Los códigos se formatean con `'CLI-' || lpad(n::text, 4, '0')` sin truncar: pasado 9999 sale `CLI-10000`.
2. **Función central de normalización** `public.normalizar_telefono(text)`: solo dígitos y quita ceros iniciales — idéntica a `normalizePhone` del importador.
3. **Función `public.clientes_import_key(...)`** que replica exactamente `buildImportKey`, incluyendo el hash FNV-1a de `stableHash`, con la misma prioridad: teléfono (≥7 dígitos) → correo real → empresa normalizada + dirección → vacío (queda para revisión).
4. **Trigger `BEFORE INSERT OR UPDATE`** en `clientes`:
   - asigna código desde la secuencia solo si viene vacío o nulo; conserva el código explícito de una importación;
   - en UPDATE nunca cambia un código ya asignado salvo que quien ejecute sea admin/super admin;
   - recalcula `telefono_normalizado` cuando cambia `celular`;
   - completa `external_import_key` cuando falta, con la regla central.
5. **Índice único case-insensitive** sobre `lower(btrim(codigo_cliente_externo))` (parcial, ignorando vacíos). Los intentos duplicados se rechazan.
6. **Campo `origen_registro`** `text not null default 'manual'` con validación por trigger a: `manual`, `importacion`, `autorregistro`, `integracion`.
7. **Auditoría**: trigger que registra en `audit_logs` el código asignado, origen, usuario creador y fecha en cada alta, y los cambios de teléfono en cada actualización. Los rechazos por código duplicado se registran desde el manejo de error del importador y del formulario.

## Backfill (misma migración, sin sobrescribir nada)

- Códigos: solo donde está NULL o vacío → Calberto Solmo recibe `CLI-0516`. Los `VTA-####` se conservan tal cual.
- `telefono_normalizado`: se recalcula desde `celular` donde falte y haya dígitos.
- `external_import_key`: se completa solo donde falte.
- `origen_registro`: `importacion` para los registros con `external_import_key` de lote, `manual` para el resto.
- Se reporta al final la cantidad corregida y la lista de registros que quedan sin teléfono utilizable (los 21 con celular `—`).

## Aplicación

- **Formulario admin de clientes** (`src/pages/admin/Clientes.tsx`):
  - el código no se genera ni se envía desde React; se lee del `INSERT ... select()` y se muestra como campo de solo lectura en la ficha;
  - solo super admin puede editarlo; para admin común queda deshabilitado;
  - empresa, contacto, celular y ciudad pasan a obligatorios, con empresa y contacto claramente diferenciados en el formulario;
  - el alta envía `origen_registro: 'manual'`;
  - si la base rechaza el código por duplicado, se muestra el mensaje concreto y se registra el intento.
- **`import-clientes`**: deja de calcular el código cuando el archivo no lo trae (lo genera la base), respeta los códigos existentes, y antes de escribir verifica que el código del archivo no pertenezca a otro cliente: si pertenece, la fila va a incidencias como `conflicto_desde_preview` en lugar de crear o pisar. Envía `origen_registro: 'importacion'`. El orden de búsqueda de coincidencias pasa a ser: código → `external_import_key` → teléfono → email → nombre+dirección.
- **`import-pedidos`** (`src/lib/importPedidos.ts` + pantalla): resuelve el cliente primero por código y luego por las claves existentes; las coincidencias dudosas siguen yendo a mapeo manual, sin crear clientes nuevos.
- **Compatibilidad**: pruebas que comparan la salida de las funciones SQL contra `normalizePhone` y `buildImportKey` de TypeScript con un juego de casos reales (teléfonos con ceros, `—`, emails provisionales, empresas con acentos).

## Pruebas que se ejecutan

Alta manual sin código, dos altas concurrentes, importación con y sin código, código duplicado rechazado, cambio de empresa sin tocar el código, cambio de celular recalculando el teléfono, backfill del registro antiguo, pedido histórico vinculado al cliente correcto, código por encima de 9999, admin común sin permiso de edición del código, y reimportación sin duplicar.

## Informe final

Al terminar informo: archivos modificados, función y trigger creados, valor inicial de la secuencia (516), registros corregidos por el backfill, duplicados encontrados (0), resultado de cada prueba y los registros que requieren conciliación manual. No se elimina, fusiona ni sobrescribe ningún cliente.
