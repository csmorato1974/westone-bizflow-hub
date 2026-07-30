## Diagnóstico (verificado)

El Dashboard **ya consulta la base de datos** (clientes, pedidos, perfiles, roles). El problema no está en el código de la página: **ninguna tabla del esquema `public` tiene permisos concedidos a los roles de la API de datos**.

Consultado ahora mismo:
- La BD sí tiene datos: 268 clientes, 271 perfiles, 274 roles, 14 productos, 2 pedidos.
- Las políticas de acceso (RLS) existen y son correctas para admin/super admin.
- Pero la consulta de permisos devuelve **cero filas**: los roles `authenticated`, `anon` y `service_role` no tienen SELECT/INSERT/UPDATE/DELETE sobre ninguna tabla.

Sin esos permisos, cada consulta desde la app devuelve un error de permiso, por lo que el Dashboard muestra 0 en todas las tarjetas y las listas quedan vacías. Esto afecta a toda la app, no solo al Dashboard.

## Qué haré

1. **Migración de permisos**: conceder, tabla por tabla del esquema `public`:
   - `SELECT, INSERT, UPDATE, DELETE` a `authenticated` (las políticas RLS siguen filtrando qué filas ve cada rol; nadie ve de más).
   - `ALL` a `service_role` (necesario para las funciones de servidor: importación de clientes, borrado de usuarios).
   - **Sin** permisos a `anon`: no hay contenido público en esta app, todo requiere sesión iniciada.

2. **Verificación posterior**:
   - Volver a consultar el catálogo de permisos para confirmar que cada tabla quedó cubierta.
   - Abrir la app en navegador con sesión de super admin y comprobar que el Dashboard muestra los conteos reales (clientes, pedidos, por aprobar, en despacho) y que la alerta de perfiles pendientes se calcula.

3. **Ajuste menor en el Dashboard**: hoy, si la consulta de conteos falla, las tarjetas muestran silenciosamente `0`. Añadiré manejo de error para que, si vuelve a haber un fallo de acceso, la tarjeta muestre un indicador de error en vez de un cero engañoso.

## Observación adicional (fuera del alcance, para tu decisión)

Al revisar la BD detecté que **no hay ningún trigger activo**, aunque las funciones sí existen. Eso significa que ahora mismo:
- Al registrarse un usuario nuevo no se crea automáticamente su perfil ni su rol (`handle_new_user`).
- No se valida el precio de las líneas de pedido contra la lista asignada.
- No se actualizan solas las marcas de tiempo ni el orden de conversaciones del chat.

No lo incluyo en este plan porque pediste específicamente el Dashboard, pero conviene restaurarlo en un paso siguiente. Dime si lo agrego.

## Detalles técnicos

- Migración SQL única con un bloque `DO` que recorre las tablas base de `public` y aplica `GRANT` solo donde falte, más `GRANT ALL ... TO service_role`.
- No se modifican políticas RLS ni el esquema: solo privilegios de la API de datos.
- Cambio de frontend acotado a `src/pages/Dashboard.tsx` (estado de error en `cargarStats`).
