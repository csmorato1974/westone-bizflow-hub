## Situación verificada

- 271 cuentas de acceso; solo 2 son administradores: `csolizmo@gmail.com` (super admin) y `moronsergio@gmail.com` (admin, además vendedor y logística).
- Datos actuales: 270 fichas de cliente, 2 pedidos con 3 líneas, 275 asignaciones de rol, 17 mensajes en 5 conversaciones, 2 notificaciones, 2 lotes de importación, 330 registros de auditoría.
- La tabla de perfiles ya está vacía (0 filas), así que ahí no hay nada que borrar.

## Qué haré (borrado total)

Purga en un solo paso, respetando el orden de dependencias:

1. Líneas de pedido y pedidos (los 2 pedidos y sus 3 líneas).
2. Las 270 fichas de cliente.
3. Mensajes, participantes y las 5 conversaciones del chat.
4. Notificaciones.
5. Incidencias y lotes de importación.
6. Los 330 registros de auditoría.
7. Roles de todas las cuentas no administradoras.
8. Las 269 cuentas de acceso no administradoras (se eliminan de la capa de autenticación mediante la función de servidor con permisos de administrador, en lotes para evitar tiempos de espera).

Se conservan íntegras las dos cuentas administradoras, sus roles y su acceso.

## Verificación posterior

- Reconsultar los conteos de todas las tablas para confirmar que quedan en cero y que solo persisten las 2 cuentas administradoras.
- Abrir la app con sesión de super admin y comprobar que el Dashboard, Clientes, Pedidos y Usuarios cargan vacíos sin errores.

## Detalles técnicos

- Los borrados de datos se hacen con sentencias `DELETE` mediante la herramienta de datos (no migración), ya que no hay cambios de esquema.
- El borrado en `auth.users` requiere la API de administración: se ejecuta con un script que invoca la función de servidor existente `delete-user` por lote, o directamente contra la API admin con la clave de servicio desde el entorno de servidor. No se toca el esquema `auth` por SQL.
- Advertencia: esta operación es irreversible y no genera respaldo automático. Si quieres una copia previa de clientes/pedidos en CSV antes de purgar, dímelo y la exporto primero.
