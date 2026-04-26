## Objetivo

Impedir que un usuario con rol `admin` (no `super_admin`) pueda modificar de cualquier manera la cuenta de un `super_admin`. Solo otro `super_admin` debería poder tocarla.

## Diagnóstico actual

En `src/pages/admin/Usuarios.tsx`:
- El botón **Eliminar** ya está protegido con `isSuper && !r.roles.includes("super_admin")`. ✅
- Pero un admin normal todavía puede:
  - Quitar roles de un super_admin (botón ❌ en cada badge).
  - Agregar nuevos roles a un super_admin (selector "Agregar rol…" + "Asignar").
  - Cambiar/quitar el propio rol `super_admin`.

A nivel de base de datos, la policy `roles_admin_manage` sobre `user_roles` permite **a cualquier admin** ejecutar INSERT/UPDATE/DELETE sobre roles de cualquier usuario, incluido un super_admin. Esto es un riesgo de escalada/bloqueo: un admin podría degradar al super_admin desde la consola o con una llamada directa al API.

También conviene revisar `profiles_admin_all` (admin puede actualizar el perfil del super_admin) y `delete-user` edge function (ya bloquea borrar super_admin, según el resumen previo).

## Plan de cambios

### 1. Frontend — `src/pages/admin/Usuarios.tsx`
- Calcular por fila `const isTargetSuper = r.roles.includes("super_admin");`
- Si `isTargetSuper && !isSuper` (es decir, soy admin pero no super):
  - Ocultar el botón ❌ de cada badge de rol.
  - Ocultar el bloque inferior con `Select` "Agregar rol…" + botón "Asignar".
  - Mantener visibles los botones de WhatsApp / Email (solo contacto, no editan).
- Como salvaguarda extra, también ocultar la opción `super_admin` dentro del `<Select>` "Agregar rol…" cuando `!isSuper`, para que un admin no pueda promover a nadie a super_admin.

### 2. Backend — Migración SQL para reforzar la regla
Reemplazar la policy `roles_admin_manage` por dos policies más estrictas en `public.user_roles`:

```sql
DROP POLICY IF EXISTS roles_admin_manage ON public.user_roles;

-- super_admin puede gestionar todos los roles
CREATE POLICY roles_super_admin_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- admin puede gestionar roles, pero NO los de un super_admin
-- y NO puede asignar el rol super_admin a nadie
CREATE POLICY roles_admin_manage_non_super ON public.user_roles
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(user_id, 'super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND role <> 'super_admin'
    AND NOT public.has_role(user_id, 'super_admin')
  );
```

Y endurecer también `profiles_admin_all` para que un admin no pueda editar el perfil de un super_admin:

```sql
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;

CREATE POLICY profiles_super_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY profiles_admin_non_super ON public.profiles
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND NOT public.has_role(id, 'super_admin')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND NOT public.has_role(id, 'super_admin')
  );
```

(Las policies `profiles_self_select` y `profiles_self_update` ya permiten al propio super_admin verse y editarse a sí mismo, así que no se rompe nada.)

### 3. Verificación post-implementación
- Loguearse como admin → la tarjeta del super_admin se muestra solo con info y contactos, sin botones para tocar roles.
- Intento manual vía consola con `supabase.from('user_roles').delete()....` sobre un super_admin → falla por RLS.
- Loguearse como super_admin → puede seguir gestionando todo, incluido a otros super_admin.

## Archivos afectados
- `src/pages/admin/Usuarios.tsx` (UI)
- Nueva migración en `supabase/migrations/` (RLS sobre `user_roles` y `profiles`)
