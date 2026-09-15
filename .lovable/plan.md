# Auditoría SQL de seguridad (solo lectura) — RLS y funciones

Sin cambios aplicados: no se modificó ningún archivo, ninguna política, ningún permiso ni la base de datos.

## Consultas ejecutadas (solo SELECT)

1. `pg_policies` filtrado a `clientes` y `pedidos` (definición completa: `cmd`, `roles`, `qual`, `with_check`).
2. `pg_trigger` + `pg_class` + `pg_proc` con `pg_get_triggerdef` para `clientes`, `pedidos`, `pedido_items`.
3. `pg_proc` + `pg_namespace` con `prosecdef` y `proacl` (funciones SECURITY DEFINER y sus permisos).
4. `has_function_privilege('anon'|'authenticated', oid, 'EXECUTE')` sobre todas las funciones de `public`.
5. `pg_proc.prosrc` de las funciones implicadas en identidad, precios, estadísticas y el bloqueo de logística.

## Hallazgo 1 — clientes_vendedor_update (nivel error)

Política actual: `USING` y `WITH CHECK` iguales, ambos `vendedor_id = auth.uid() AND has_role(auth.uid(),'vendedor')`.

- No hay restricción de columnas. Un vendedor puede modificar cualquier campo de un cliente que tiene asignado.
- Campos sensibles alcanzables: `user_id` (vincula la ficha a una cuenta de acceso arbitraria), `lista_precio_id` (cambia precios aplicables), `email`, `celular`, `activo`, campos GPS.
- No puede robar clientes de otro vendedor (el `USING` lo impide) ni cambiar `codigo_cliente_externo`: el trigger `trg_clientes_bu_identidad` lo bloquea salvo por `corregir_codigo_cliente`, que exige `super_admin`.
- Triggers presentes en `clientes`: identidad antes de INSERT/UPDATE y auditoría después. Ninguno protege columnas de propiedad.

Riesgo real: **alto y confirmado**. Escalada mediante `user_id`: reapuntar la ficha a una cuenta propia da acceso a `pedidos` y al portal de ese cliente vía `cliente_de_usuario`. No es falso positivo.

## Hallazgo 2 — pedidos_vendedor_update (nivel aviso)

Política actual: `USING` = vendedor propietario con rol vendedor; `WITH CHECK` añade `cliente_de_vendedor(cliente_id, auth.uid())`.

- Tampoco restringe columnas: el vendedor puede escribir `total`, `numero`, `estado`, `lista_precio_*_snapshot`, marcas de stock.
- Protecciones existentes: `trg_validar_precio_pedido_item` valida el precio unitario en `pedido_items`; `trg_pedidos_logistica_pivot` protege campos solo frente al rol logística; `trg_pedido_reservar_y_consumir_stock` reacciona a cambios de estado.
- Ninguna protección impide que un vendedor escriba `total` directamente, así que puede desalinear el total respecto a la suma de líneas, o saltar estados (p. ej. pasar a `entregado`) disparando consumo de stock.

Riesgo real: **medio-alto**. Integridad financiera y de inventario, no fuga de datos. No es falso positivo.

## Hallazgo 3 — Public Can Execute SECURITY DEFINER Functions (nivel aviso)

Funciones SECURITY DEFINER ejecutables por `anon`: exactamente tres, todas del portal de cliente por token — `portal_catalogo(_token)`, `portal_pedidos(_token)`, `portal_crear_pedido(_token,_items,_notas)`.

- Ninguna otra función SECURITY DEFINER es ejecutable por `anon`. Los triggers y funciones internas (`handle_new_user`, `clientes_bi/bu_identidad`, `pedido_reservar_y_consumir_stock`, `proteger_*`, `es_cuenta_administrativa`) ya están restringidos a `postgres`/`service_role`.
- El acceso anónimo es el diseño del portal: el cliente entra con un enlace con token, sin cuenta. La autorización vive dentro de la función, contra el hash del token en `cliente_portal_tokens`.

Veredicto: **falso positivo funcional / riesgo aceptado por diseño**, condicionado a que el token sea largo, hasheado, revocable y con control de reintentos. La superficie sí es real: quien conserve un token válido opera como ese cliente.

## Dependencias que se romperían al revocar EXECUTE

- `has_role`, `is_admin`, `cliente_de_usuario`, `cliente_de_vendedor`, `cliente_tiene_pedido_despacho`, `puede_ver_pedido`, `puede_editar_pedido`, `is_conversation_participant`: usadas dentro de políticas RLS de casi todas las tablas. Revocar `EXECUTE` a `authenticated` dejaría la app sin lectura ni escritura. **No tocar.**
- `portal_*`: revocar `anon` apaga por completo el portal de clientes (catálogo, pedidos y creación de pedido desde el enlace). **No revocar sin decisión de producto.**

## Propuesta de corrección (no aplicada)

Todo por trigger, siguiendo el patrón ya usado para logística; no se cambia ninguna política ni permiso, así que no hay riesgo de romper RLS.

1. Trigger `BEFORE UPDATE` en `clientes` que, cuando el actor no sea admin (`is_admin(auth.uid())` falso) y tenga rol vendedor, fuerce a mantener los valores antiguos de `user_id`, `vendedor_id`, `lista_precio_id`, `email`, `email_provisional` y campos de onboarding, o bien lance error `42501` si intenta cambiarlos. Vendedor conserva `contacto`, `celular`, `direccion`, `ciudad`, `notas`, GPS.
2. Trigger `BEFORE UPDATE` en `pedidos` que, para actor vendedor no admin, bloquee cambios en `numero`, `total`, `cliente_id`, `creado_por`, snapshots de lista de precios y marcas de stock; y limite las transiciones de `estado` a las operativas del vendedor (`borrador` → `enviado`, `cancelado`), dejando `aprobado`/`listo_despacho`/`en_ruta`/`entregado` a admin y logística.
3. Recalcular `total` en el servidor a partir de `pedido_items` (trigger sobre `pedido_items`) para que el campo deje de depender del cliente que lo escribe.
4. Hallazgo 3: no revocar. Documentarlo como riesgo aceptado y, como refuerzo opcional, añadir caducidad al token del portal y registro de uso (`ultimo_uso_en` ya existe).

## Semáforo

- clientes_vendedor_update: **ROJO** — escalada de privilegios confirmada, corregir.
- pedidos_vendedor_update: **ÁMBAR** — integridad financiera y de stock, corregir después.
- SECURITY DEFINER ejecutables por público: **VERDE con nota** — solo el portal por token, por diseño; no revocar.

Estado de esta auditoría: archivos tocados ninguno · publicación no · base de datos no tocada · ninguna alerta ignorada.
