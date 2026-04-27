
## Diagnóstico

Verifiqué la base de datos. Yago Franco sigue apareciendo porque su ficha de cliente **realmente está incompleta**:

| Usuario | Rol | Ficha cliente | Falta |
|---|---|---|---|
| Yago Franco | cliente | sí | **dirección + vendedor** |
| Gringa | cliente | sí | nada → no aparece ✅ |
| Calberto Solmo | vendedor | — | (no aplica) |
| Alberto Morato | admin/vendedor | — | (no aplica) |

La lógica funciona, pero el usuario no ve **qué** falta ni dónde resolverlo, así que cree que ya terminó. Además, hoy sólo se evalúan clientes; no avisa de otros vacíos de configuración.

## Cambios propuestos

### 1. Convertir el badge en un popover multimodal (`src/pages/Dashboard.tsx`)

Reemplazo el badge-link simple por un **Popover** (componente `@/components/ui/popover` ya disponible) que se abre al hacer clic en el número rojo:

- Encabezado: "N perfiles requieren configuración".
- Lista por usuario con su nombre + email + chips rojos indicando qué falta exactamente:
  - "Sin rol asignado"
  - "Sin lista de precios"
  - "Sin vendedor asignado"
  - "Sin dirección"
  - "Sin ficha de cliente vinculada"
- Cada fila tiene un botón "Configurar" que lleva a `/app/admin/usuarios?focus={userId}` (o a `/app/admin/clientes?focus={clienteId}` si la falta es de la ficha comercial).

### 2. Ampliar la definición de "pendiente" (multimodal)

Un perfil entra en la lista si cumple **cualquiera** de estos motivos, y cada motivo se reporta por separado:

- **Sin rol**: 0 roles.
- **Cliente sin ficha**: rol `cliente` y no existe registro en `clientes` con `user_id`.
- **Cliente sin dirección**: rol `cliente`, ficha existe, `direccion` nulo/vacío.
- **Cliente sin lista de precios**: rol `cliente`, ficha existe, `lista_precio_id` nulo.
- **Cliente sin vendedor**: rol `cliente`, ficha existe, `vendedor_id` nulo.

Cada perfil puede tener varios motivos a la vez (de ahí "multimodal": múltiples causas listadas como chips).

El badge muestra la **cantidad de perfiles** afectados (no la cantidad de motivos).

### 3. Estructura de datos en el front

Cambio el estado de `pendientes` para guardar el detalle, no sólo el conteo:

```ts
type Motivo = 'sin_rol' | 'sin_ficha' | 'sin_direccion' | 'sin_lista' | 'sin_vendedor';
type PerfilPendiente = {
  user_id: string;
  cliente_id: string | null;
  full_name: string | null;
  email: string | null;
  motivos: Motivo[];
};
type PendientesState =
  | { status: 'loading' }
  | { status: 'ok'; perfiles: PerfilPendiente[] }
  | { status: 'error' };
```

El cálculo actual en `calcularPendientes()` se reescribe para devolver este array. Realtime se mantiene tal cual.

### 4. Indicadores visuales

- `perfiles.length > 0` → badge rojo pulsante con el número, **clic abre el popover** (ya no es un Link directo).
- `perfiles.length === 0` → punto verde discreto (sin cambios).
- `error` → "!" gris (sin cambios).
- En el popover, además del listado, un botón al pie "Ver todos en Usuarios" que navega a `/app/admin/usuarios?filter=pendientes`.

### 5. Soporte de `?focus=` en destinos

- `src/pages/admin/Usuarios.tsx`: si recibe `?focus={userId}`, hace scroll a esa fila y la resalta brevemente (ring brand 2s).
- `src/pages/admin/Clientes.tsx`: mismo comportamiento con `?focus={clienteId}`.

Esto resuelve el reclamo del usuario: hoy el badge llevaba a un listado plano sin indicarle dónde mirar.

### 6. Filtro de Usuarios mantiene compatibilidad

`?filter=pendientes` sigue funcionando. La lógica se duplica brevemente en `Usuarios.tsx` (ya está así) — opcionalmente podría extraerse a un helper `src/lib/perfilesPendientes.ts`, pero lo dejo para no inflar el cambio.

## Resultado esperado

- Yago Franco aparece en el popover con dos chips: "Sin dirección" y "Sin vendedor". Clic en "Configurar" → va a su ficha de cliente con la fila resaltada.
- Cuando el admin complete esos campos, realtime recalcula y Yago desaparece del popover automáticamente. Si era el único, el badge cambia al punto verde.
- Cualquier nuevo usuario sin rol o cliente sin configurar aparece al instante con sus motivos específicos.
