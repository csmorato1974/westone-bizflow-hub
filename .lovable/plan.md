# Plan: Badge de perfiles pendientes en el Dashboard

## Resumen
Agregar un círculo rojo con el número de perfiles nuevos pendientes (usuarios sin rol asignado) sobre el cuadro de "Clientes" en el Dashboard, visible solo para admin y super_admin. Al hacer click, redirige a la gestión de usuarios filtrados por "sin rol".

## Cambios a realizar

### 1. Frontend — `src/pages/Dashboard.tsx`

**Lógica nueva:**
- Agregar query adicional para contar perfiles sin rol asignado:
  - Obtener `count` de `profiles` y `count` de `user_roles` con `user_id` distintos
  - Calcular `pendientesPerfiles = totalProfiles - usuariosConRol`
  - Alternativa más precisa: traer `profiles.id` y `user_roles.user_id`, calcular en cliente quiénes no tienen ningún rol
- Solo ejecutar este conteo si `isAdmin` es true

**UI del badge:**
- En el cuadro "Clientes" agregar un badge tipo "pop up" en la esquina superior derecha:
  - Círculo rojo (`bg-destructive`) con número blanco
  - Animación sutil (`animate-pulse`) para llamar la atención
  - Posición absoluta sobre la Card
  - Solo se muestra si `pendientesPerfiles > 0` y el usuario es admin/super_admin
- El cuadro "Clientes" debe redirigir (cuando hay pendientes y es admin) a `/app/admin/usuarios` en lugar de `/app/admin/clientes` — o mantener el cuadro de Clientes y agregar un tooltip/click separado al badge

**Decisión de navegación:**
- Mantener el cuadro de "Clientes" enlazando a su destino actual
- El badge rojo será un elemento clickeable independiente que navega a `/app/admin/usuarios?filter=sin_rol`

### 2. Frontend — `src/pages/admin/Usuarios.tsx`

**Soporte para query param:**
- Leer `?filter=sin_rol` desde la URL al montar el componente
- Si está presente, inicializar `filterRole` con `"sin_rol"` para mostrar directamente los pendientes

## Notas técnicas

**Conteo de pendientes (consulta sugerida):**
```typescript
// Obtener IDs de profiles y user_ids con rol
const [{ data: profs }, { data: roles }] = await Promise.all([
  supabase.from("profiles").select("id"),
  supabase.from("user_roles").select("user_id"),
]);
const conRol = new Set((roles ?? []).map(r => r.user_id));
const pendientes = (profs ?? []).filter(p => !conRol.has(p.id)).length;
```

**Componente del badge (esquema visual):**
```tsx
{isAdmin && pendientes > 0 && (
  <Link 
    to="/app/admin/usuarios?filter=sin_rol"
    className="absolute -top-2 -right-2 z-10"
  >
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1.5 shadow-lg animate-pulse ring-2 ring-background">
      {pendientes}
    </span>
  </Link>
)}
```

- El contenedor del cuadro debe tener `position: relative` para que el badge se posicione correctamente
- El badge usa `z-10` para estar por encima del Link de la Card

## Archivos modificados
- `src/pages/Dashboard.tsx` — agregar contador y badge visual
- `src/pages/admin/Usuarios.tsx` — soportar query param `?filter=sin_rol`