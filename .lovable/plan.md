# Plan: Corregir badge de perfiles pendientes (no aparece nada)

## Diagnóstico

Revisé los datos reales en la base de datos:

| Perfil | Roles asignados |
|---|---|
| Yago Franco | cliente |
| Gringa | cliente |
| Calberto Solmo | vendedor |
| Alberto Morato | admin, vendedor |
| Sergio Morón | logistica, admin, vendedor |
| carlos soliz | super_admin |

**El badge no aparece porque el cálculo actual ("usuarios sin ningún rol") siempre da 0.** El trigger `handle_new_user` asigna automáticamente el rol `cliente` a TODO usuario recién registrado, así que jamás existe un usuario realmente "sin rol".

Los perfiles que en la práctica **están pendientes de configurar** son los que tienen únicamente el rol `cliente` por defecto (auto-asignado) y aún no han sido vinculados a una ficha real en la tabla `clientes` (lo que el admin debe completar). En este momento serían: **Yago Franco** y **Gringa** → el badge debería mostrar **2**.

## Cambio a realizar

### `src/pages/Dashboard.tsx`

Cambiar la lógica del conteo de pendientes para incluir tres casos como "pendiente de configurar":

1. Perfil **sin ningún rol** asignado (caso defensivo).
2. Perfil cuyo **único rol es `cliente`** (auto-asignado) **y** no tiene una ficha vinculada en la tabla `clientes` (`clientes.user_id`).

Esto identifica correctamente los perfiles recién registrados que el admin debe terminar de configurar (asignarle un rol distinto, o vincularlo a una ficha de cliente real).

**Nueva lógica (pseudocódigo):**

```ts
const [{ data: profs }, { data: roles }, { data: clientesRows }] = await Promise.all([
  supabase.from("profiles").select("id"),
  supabase.from("user_roles").select("user_id, role"),
  supabase.from("clientes").select("user_id"),
]);

const rolesByUser = new Map<string, string[]>();
(roles ?? []).forEach((r) => {
  const arr = rolesByUser.get(r.user_id) ?? [];
  arr.push(r.role);
  rolesByUser.set(r.user_id, arr);
});
const clientesVinculados = new Set(
  (clientesRows ?? []).map((c) => c.user_id).filter(Boolean)
);

const sinConfigurar = (profs ?? []).filter((p) => {
  const rls = rolesByUser.get(p.id) ?? [];
  if (rls.length === 0) return true;
  if (rls.length === 1 && rls[0] === "cliente" && !clientesVinculados.has(p.id)) return true;
  return false;
}).length;

setPerfilesPendientes(sinConfigurar);
```

El resto de la UI del badge (círculo rojo pulsante en la esquina del cuadro Clientes, navegación a `/app/admin/usuarios?filter=sin_rol`) ya está implementada y se mantiene igual.

### `src/pages/admin/Usuarios.tsx` (ajuste menor)

Como ahora el filtro `sin_rol` no representa exactamente lo mismo que muestra el badge, se mantiene el comportamiento actual del filtro pero el badge llevará a una vista útil. Opcionalmente, se podría agregar un filtro nuevo "Pendientes de configurar" pero no es estrictamente necesario para resolver el problema reportado.

## Resultado esperado

Tras el cambio, en el Dashboard del super_admin/admin se verá un círculo rojo con el número **2** en la esquina superior derecha del cuadro **Clientes**, correspondiente a Yago Franco y Gringa que aún tienen solo el rol `cliente` por defecto y no han sido vinculados a una ficha en la tabla `clientes`.

## Archivos modificados
- `src/pages/Dashboard.tsx` — corregir lógica de conteo de perfiles pendientes