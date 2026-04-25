
## Objetivo

En `/app/admin/clientes` (sección Clientes del super admin / admin), incluir automáticamente **todos los perfiles registrados** en la sección "Cuentas sin ficha de cliente" — no solo los que ya tienen rol `cliente`. Cada contacto mostrará su(s) rol(es) actual(es) como una etiqueta configurable, permitiendo convertirlo en cliente con un clic.

Esto resuelve el caso típico: un usuario se registra como vendedor (o sin rol, o con cualquier otro rol) y más tarde necesita operar también como cliente.

## Cambios — solo frontend

### `src/pages/admin/Clientes.tsx`

1. **Ampliar el cálculo de "huérfanos"**:
   - Hoy `huerfanos` filtra `clienteUsers` (solo perfiles con rol `cliente`) que no tengan ficha vinculada.
   - Cambiar a: **todos los perfiles** (`profiles`) que NO estén ya vinculados a una ficha de `clientes` vía `user_id`, excepto el propio super admin si se desea (opcional, lo dejamos visible).
   - Para esto, cargar todos los perfiles y un mapa `userId → AppRole[]` desde `user_roles` (ya se trae `ur`).

2. **Mostrar rol(es) actuales como badge configurable** en cada tarjeta de "Cuentas sin ficha":
   - Junto al nombre/email mostrar badges con cada rol actual (ej. `vendedor`, `logistica`, `sin rol`).
   - Estilo coherente con `AdminUsuarios` (badge `bg-brand`).
   - Botón **"Convertir en cliente"** que:
     - Si el perfil aún no tiene rol `cliente`, hace `INSERT` en `user_roles` con `role: 'cliente'` (manteniendo sus otros roles — los roles son acumulativos, ya soportado por la tabla con `unique(user_id, role)`).
     - Luego abre el diálogo `openCreateForUser(u)` ya existente para crear la ficha en `clientes` y vincular `user_id`.
   - Mantener el botón existente **"Crear ficha"** para los que ya son `cliente` puro.

3. **Renombrar / reagrupar la sección**:
   - Título: "Perfiles disponibles para vincular como cliente".
   - Texto auxiliar: "Cualquier perfil registrado puede ser convertido en cliente. Sus roles previos se conservan."
   - Subdivisión visual opcional con dos grupos:
     - **"Cuentas con rol cliente sin ficha"** (flujo actual, prioritario, badge `warning`).
     - **"Otros perfiles (vendedor, logística, sin rol, etc.)"** (colapsable o segundo bloque, badge informativo, con botón "Convertir en cliente + crear ficha").

4. **Filtro/búsqueda**:
   - El input `search` actual aplicará también al nuevo bloque (filtrar por nombre / email).
   - Añadir un mini selector para filtrar "Mostrar perfiles con rol: todos / sin rol / vendedor / logistica / admin".

5. **Auditoría**:
   - Al asignar el rol `cliente` registrar `logAudit("asignar_rol", "user_roles", userId, { role: "cliente", origen: "clientes_admin" })`.
   - Al crear la ficha se mantiene `logAudit("crear_cliente_admin", ...)` ya existente.

6. **Realtime**:
   - El canal `admin-clientes-sync` ya escucha `profiles`, `user_roles` y `clientes`, así que cualquier alta nueva aparecerá automáticamente sin recargar. No hace falta cambiarlo.

## Lo que NO se cambia

- No se modifica la base de datos: la tabla `user_roles` ya soporta múltiples roles por usuario (`unique(user_id, role)`), y la RLS `roles_admin_manage` permite a admins/super_admins insertar el rol.
- No se altera el sidebar (la entrada "Clientes" en Administración ya existe y es la que se enriquecerá).
- No se modifican los flujos de Vendedores / Logística / Cliente — solo se permite que un mismo perfil tenga rol `cliente` adicional.

## Resultado para el usuario

Como super admin, al entrar a **Administración → Clientes** verás:
- Tu lista actual de clientes con ficha (sin cambios).
- Una sección ampliada con **todos los perfiles** que aún no son clientes con ficha, mostrando su rol actual con un badge.
- Un botón **"Convertir en cliente"** que en un paso le agrega el rol `cliente` al perfil y abre el formulario de ficha pre-rellenado, dejándolo operativo como cualquier cliente dado de alta desde el inicio.
