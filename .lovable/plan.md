

# Vincular usuarios cliente a fichas de cliente

## Problema
El catálogo del modo cliente busca un registro en `clientes` con `user_id = auth.uid()`. Actualmente **ningún cliente tiene ese campo poblado**, así que cualquier usuario con rol `cliente` ve el mensaje "cuenta no vinculada".

Ejemplo: el usuario `csmorato@hotmail.com` (rol `cliente`) existe, pero ninguna de las 3 fichas (`Caca Gas`, `Coco Gas`, `Pete taller`) lo tiene vinculado.

## Solución (3 partes)

### 1. Vincular ahora `csmorato@hotmail.com` a una ficha existente
Para que puedas probar el flujo de cliente de inmediato, vinculo ese usuario a una de las fichas existentes. Necesito que me digas a cuál: `Caca Gas`, `Coco Gas` o `Pete taller`. Si no especificas, vinculo a `Caca Gas` por defecto.

```sql
UPDATE clientes SET user_id = 'c1ac10f3-d672-4f31-94e4-7288619bfb42'
WHERE id = '<id de la ficha elegida>';
```

### 2. Mejorar `Admin → Clientes` para vincular usuarios fácilmente
La pantalla ya tiene un selector "Usuario portal cliente (opcional)", pero:
- No muestra qué fichas ya están vinculadas (puedes asignar el mismo usuario a varias por error).
- No permite **desvincular** (quitar el `user_id`).

Cambios en `src/pages/admin/Clientes.tsx`:
- Mostrar badge "🔗 Vinculado a {email}" cuando `user_id` esté presente.
- Añadir opción "— Desvincular —" en el selector.
- Filtrar de la lista los usuarios cliente que ya estén vinculados a otra ficha (con opción de mostrar todos).

### 3. Permitir que el vendedor también vincule el usuario al crear/editar el cliente
En `src/pages/vendedor/Clientes.tsx`:
- Al crear cliente, agregar selector opcional "Vincular a usuario registrado" (lista usuarios con rol `cliente` que aún no estén vinculados).
- Esto evita depender siempre del admin para activar el portal del cliente.

## Mensaje más útil en el catálogo
En `src/pages/cliente/Catalogo.tsx`, mejorar el mensaje cuando no hay vinculación, indicando claramente que un administrador o vendedor debe enlazar la cuenta a una ficha de cliente, mostrando el email del usuario actual para facilitar la identificación.

## Flujo correcto a partir de ahora

```text
Cliente se registra en /login
        ↓
Confirma email
        ↓
Admin le asigna rol "cliente" en Admin → Usuarios
        ↓
Admin (o vendedor) abre la ficha del cliente y selecciona
su usuario en "Usuario portal cliente"
        ↓
Cliente entra y ve su catálogo + puede pedir
```

## Confirma antes de ejecutar
**¿A qué ficha vinculo `csmorato@hotmail.com`?** `Caca Gas`, `Coco Gas` o `Pete taller`. Si no respondes, uso `Caca Gas`.

