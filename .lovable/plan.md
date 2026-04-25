## Objetivo
Eliminar todos los perfiles del sistema **excepto** el super_admin `csolizmo@gmail.com` (id `9ea7d930-f7ef-46e6-ae0f-8ab73d04be58`), con borrado total de su rastro (pedidos, items, clientes, mensajes, conversaciones huérfanas, notificaciones, roles, perfil y cuenta auth).

## Perfiles a eliminar (7)
| Email | ID | Rol |
|---|---|---|
| andinochuck@gmail.com | 511978ef-f45d-44d3-a8d4-db6bddd2e490 | cliente |
| csmorat@yahoo.es | 654986ba-4520-469b-9bcc-2ef978ad5e83 | cliente |
| csmorato@hotmail.com | c1ac10f3-d672-4f31-94e4-7288619bfb42 | cliente |
| csmorato@hotmail.es | 10dc9a19-425e-4a5a-ba42-b64cfe52a2bb | vendedor |
| kniazyouk@gmail.com | a24ad277-9c42-4054-9081-51754df20d8e | admin |
| lykon.tex@gmail.com | 3b5a3a40-07f4-48f9-8846-21674fa3d568 | vendedor |
| vinculovirtualvv@gmail.com | 9c5de27b-12e2-45c1-9598-ac2a8a189798 | cliente |

## Estrategia
La edge function `delete-user` actual **preserva el histórico** (desliga vendedor de pedidos, desactiva clientes con pedidos). El usuario pidió **borrado total**, así que necesito crear una edge function temporal de uso único `purge-users` que sí cascade-elimine todo, sin tocar la lógica conservadora de `delete-user` (que sigue siendo la correcta para el día a día).

## Pasos

### 1. Crear edge function temporal `purge-users`
Archivo: `supabase/functions/purge-users/index.ts`

- Solo invocable por `super_admin`.
- Recibe `{ user_ids: string[] }`.
- Para cada `user_id`:
  1. Obtener `cliente_ids` de `clientes` donde `user_id = target`.
  2. Obtener `pedido_ids` de `pedidos` donde `cliente_id IN cliente_ids` **OR** `vendedor_id = target` **OR** `creado_por = target`.
  3. `DELETE FROM pedido_items WHERE pedido_id IN pedido_ids`.
  4. `DELETE FROM pedidos WHERE id IN pedido_ids`.
  5. `DELETE FROM clientes WHERE user_id = target`.
  6. `DELETE FROM messages WHERE sender_id = target`.
  7. Obtener `conversation_ids` de `conversation_participants` donde `user_id = target`.
  8. `DELETE FROM conversation_participants WHERE user_id = target`.
  9. Para cada conversación afectada: si ya no quedan participantes, borrar `messages` huérfanos y la `conversation`.
  10. `DELETE FROM notificaciones WHERE user_id = target`.
  11. `DELETE FROM user_roles WHERE user_id = target`.
  12. `DELETE FROM profiles WHERE id = target`.
  13. `admin.auth.admin.deleteUser(target)`.
  14. Insertar `audit_logs` con accion `purge_usuario` y resumen de filas borradas.
- Devuelve resumen por usuario.

### 2. Desplegar e invocar
- Desplegar `purge-users` con `supabase--deploy_edge_functions`.
- Llamar con `supabase--curl_edge_functions` (autenticado como super_admin) pasando los 7 `user_ids`.
- Validar respuesta y mostrar resumen al usuario.

### 3. Limpieza
- Eliminar `supabase/functions/purge-users/index.ts` del codebase.
- Llamar `supabase--delete_edge_functions(["purge-users"])` para retirar la función desplegada.
- Verificar con `SELECT count(*) FROM profiles` que queda solo 1 perfil.

## Salvaguardas
- Hardcodear server-side la lista de IDs a borrar dentro del body validado, y **rechazar** cualquier request que intente borrar `9ea7d930-f7ef-46e6-ae0f-8ab73d04be58` (csolizmo).
- Verificar que el caller es `super_admin` antes de cualquier operación.
- Auditar cada borrado en `audit_logs`.

## Archivos afectados
- **Crear** `supabase/functions/purge-users/index.ts` (temporal)
- **Eliminar** después `supabase/functions/purge-users/index.ts`

No se toca `delete-user` ni código de UI.