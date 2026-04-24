

# Restaurar acceso al catálogo

## Diagnóstico
El catálogo no aparece porque el usuario logueado (`csmorato@hotmail.es`) tiene rol `cliente` pero **no tiene ficha en la tabla `clientes`** vinculada a su `user_id`. La consulta retorna vacío y se muestra el mensaje "Tu cuenta de cliente aún no está vinculada".

Existen dos fichas con `user_id` asignado, pero a otras cuentas:
- `Coco Gas` → `csmorato@hotmail.com` (dominio distinto)
- `Pete taller` → `lykon.tex@gmail.com`

## Acción a ejecutar
Vincular la ficha **Coco Gas** al usuario actualmente logueado `csmorato@hotmail.es` (UUID `10dc9a19-425e-4a5a-ba42-b64cfe52a2bb`), que ya tiene rol `cliente` y ya tiene lista de precios asignada (`5def5d0c-917f-40f2-aa65-6e7d9cd55c4e` con 28 items).

```sql
UPDATE public.clientes
SET user_id = '10dc9a19-425e-4a5a-ba42-b64cfe52a2bb'
WHERE id = '67eaccb9-9a99-4000-9110-3d5770fc53f7';
```

Tras esto, al recargar `/app/catalogo` verá los 14 productos activos con sus precios y stock.

## Mejora preventiva (opcional, recomendada)
Para evitar que esto vuelva a pasar, agregar en **Admin → Clientes** y **Vendedor → Clientes** un selector "Vincular a usuario registrado" que liste los `profiles` con rol `cliente` aún no vinculados, para asignarles la ficha sin necesidad de SQL.

## Pregunta
¿Vinculo Coco Gas a tu cuenta actual (`csmorato@hotmail.es`) o prefieres otra ficha/otra cuenta? ¿Agrego también el selector de vinculación en la UI?

