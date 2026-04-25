# Arreglo de "Eliminar usuario" desde el panel de Super Admin

## Diagnóstico

Revisé los logs de la edge function `delete-user` y **todas las llamadas devuelven HTTP 409 (Conflict)**. Esto ocurre por dos razones combinadas:

### 1. La función bloquea cualquier eliminación con historial
En `supabase/functions/delete-user/index.ts` hay dos guardas que devuelven 409:
- Si el usuario tiene clientes con pedidos → bloquea.
- Si el usuario aparece como `vendedor_id` en pedidos → bloquea.

Como prácticamente todos los perfiles del sistema acaban quedando vinculados a algún pedido (por la conversión vendedor → cliente que hicimos antes), **nunca se puede eliminar a nadie**.

### 2. El frontend no muestra el mensaje de error real
En `src/pages/admin/Usuarios.tsx`, el handler hace:
```ts
const { data, error } = await supabase.functions.invoke("delete-user", { ... });
if (error) return toast.error(error.message);   // ← entra aquí con 409
if (data?.error) return toast.error(data.error); // ← nunca se ejecuta
```
Cuando la edge function devuelve un status no-2xx, `supabase-js` lanza un `FunctionsHttpError` genérico ("Edge Function returned a non-2xx status code") y el cuerpo JSON con el mensaje real **nunca se lee**. Eso es el "mensaje raro" que ves.

## Solución propuesta

### A) Edge function `delete-user` — permitir borrado en cascada controlado

Reescribir la lógica para que un **super_admin pueda eliminar cualquier usuario** (excepto a sí mismo y a otros super_admin), haciendo limpieza segura:

1. Mantener las protecciones esenciales:
   - No puede eliminarse a sí mismo.
   - No puede eliminar a otro `super_admin`.
2. **Quitar** los bloqueos 409 por pedidos/clientes con historial.
3. Limpieza ordenada antes de borrar el usuario:
   - `UPDATE pedidos SET vendedor_id = NULL WHERE vendedor_id = target` (preservar histórico de ventas, solo desligarlo).
   - Para los `clientes` cuyo `user_id = target`:
     - Si tienen pedidos → solo `UPDATE clientes SET user_id = NULL, activo = false` (preservar la ficha y todo el histórico de pedidos del negocio).
     - Si no tienen pedidos → `DELETE` de `clientes`.
   - `DELETE` de `messages` enviados por el usuario y `conversation_participants` donde participe (para no romper RLS de chats).
   - `DELETE` de `user_roles`, `notificaciones`, `profiles` del usuario.
   - `auth.admin.deleteUser(target)`.
4. Registrar en `audit_logs` con detalle (cuántos pedidos quedaron desligados, cuántos clientes preservados, etc.) para trazabilidad.
5. Devolver siempre JSON con `{ ok: true, summary: {...} }` o `{ error: "..." }` y status apropiado.

### B) Frontend `src/pages/admin/Usuarios.tsx` — leer el error real

Cambiar el manejo del `invoke` para parsear el cuerpo de la respuesta aun cuando llega como error HTTP:

```ts
const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id } });
if (error) {
  // Intentar leer el body de la FunctionsHttpError
  let msg = error.message;
  try {
    const ctx: any = (error as any).context;
    if (ctx?.json) msg = (await ctx.json()).error ?? msg;
    else if (ctx?.body) {
      const parsed = JSON.parse(await new Response(ctx.body).text());
      msg = parsed.error ?? msg;
    }
  } catch {}
  return toast.error(msg);
}
if (data?.error) return toast.error(data.error);
toast.success("Usuario eliminado");
```

Así, si en el futuro algún caso devuelve un mensaje de negocio, el super_admin verá el texto correcto en lugar del genérico de Supabase.

### C) Confirmación más explícita en el diálogo

Ampliar el `AlertDialogDescription` para advertir al super_admin que:
- Los pedidos donde figuraba como vendedor quedarán **sin vendedor asignado** pero conservados.
- Las fichas de cliente con historial quedarán **desligadas y desactivadas**, no eliminadas, para preservar el histórico contable.
- El resto (rol, perfil, notificaciones, mensajes) se elimina.

## Archivos a modificar

- `supabase/functions/delete-user/index.ts` — nueva lógica de cascada controlada.
- `src/pages/admin/Usuarios.tsx` — parseo robusto del error y texto del diálogo.

## Lo que NO se cambia

- No se tocan policies RLS ni el esquema de la base (todo se hace con el service role dentro de la edge function).
- No se altera `Clientes.tsx` ni el flujo de conversión que ya quedó funcionando.
