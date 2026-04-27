## Diagnóstico

Verifiqué los datos en la base. Con la definición actual, el conteo de pendientes es **0** y por eso el badge no se muestra:

| Usuario | Roles | Ficha en `clientes` | ¿Pendiente hoy? |
|---|---|---|---|
| Yago Franco | cliente | Sí | No |
| Gringa | cliente | Sí | No |
| Calberto Solmo | vendedor | — | No |
| Alberto Morato | vendedor, admin | — | No |
| Sergio Morón | vendedor, admin, logística | — | No |
| Carlos Soliz | super_admin | — | No |

Es decir: la lógica funciona, pero **no hay candidatos** porque todos los `cliente` ya fueron vinculados. El badge se oculta correctamente cuando es 0.

Para que la funcionalidad sea útil y siempre verificable, propongo cambios.

## Cambios

### 1. Nueva definición de "perfil pendiente" (`src/pages/Dashboard.tsx`)

Un perfil cuenta como **pendiente de configurar** si cumple **cualquiera** de:

- **A.** No tiene ningún rol asignado (caso defensivo).
- **B.** Tiene únicamente el rol `cliente` por defecto **y** no está vinculado a una ficha en `clientes` (`clientes.user_id`).
- **C.** Tiene únicamente el rol `cliente` **y** sí está vinculado, pero su ficha en `clientes` está incompleta — definimos "incompleta" como: falta `direccion` o falta `lista_precio_id` o falta `vendedor_id`.

El caso **C** es el que hará visible el badge ya mismo con los datos actuales (Yago y Gringa están vinculados pero su ficha puede no tener todos los campos comerciales).

### 2. Realtime

Suscribirme a cambios en `profiles`, `user_roles` y `clientes` para recalcular el contador automáticamente cuando se crea un usuario nuevo o se completa su configuración. Cleanup del canal al desmontar.

### 3. Indicador siempre visible para admin

- Si `perfilesPendientes > 0` → badge rojo pulsante con el número (como hoy).
- Si `perfilesPendientes === 0` → pequeño punto verde discreto en la esquina del cuadro Clientes con tooltip "Sin perfiles pendientes". Esto le da retroalimentación al admin de que el indicador está vivo y no roto.

### 4. Fallback ante error de consulta

Envolver las consultas de pendientes en try/catch. Si falla, mostrar un badge gris con "!" y tooltip "No se pudo verificar pendientes" en vez de quedar invisible. Loggear el error en consola.

### 5. Filtro en Usuarios

Mantener el comportamiento actual de `?filter=sin_rol` y agregar soporte para `?filter=pendientes` que muestre todos los perfiles que cumplen la nueva definición (A+B+C). Esto requiere extender el filtrado en `src/pages/admin/Usuarios.tsx` cargando además los `clientes` para evaluar el caso C.

## Detalles técnicos

- `Dashboard.tsx`: extraer la lógica de cálculo a una función `calcularPendientes()` reutilizable por el efecto inicial y el handler de realtime.
- Consulta `clientes` ampliada a `select('user_id, direccion, lista_precio_id, vendedor_id')`.
- Canal realtime: `supabase.channel('dashboard-pendientes').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, recalcular).on(... 'user_roles' ...).on(... 'clientes' ...).subscribe()`.
- Asegurar realtime en las tablas con `ALTER PUBLICATION supabase_realtime ADD TABLE ...` mediante migración (solo si no están ya en la publicación).
- Tooltip con `title=""` nativo para no agregar dependencias.

## Resultado esperado

Con los datos actuales el badge debería mostrar **2** (Yago y Gringa, asumiendo fichas comerciales incompletas). Si están completas, mostrará el punto verde de "todo al día". Cualquier usuario nuevo aparecerá reflejado al instante sin recargar.