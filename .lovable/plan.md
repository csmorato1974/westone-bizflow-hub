## Objetivo

Que la contraseña provisional de las cuentas creadas en la importación masiva sea predecible y legible para el super admin:

```text
Wst-<parte local del email provisional>-26
```

Ejemplo: email `juan.perez@clientes-temp.local` → clave `Wst-juan.perez-26`

## Cambios

1. `supabase/functions/import-clientes/rules.ts`
   - Cambiar `buildProvisionalPassword()` para que reciba el email de la cuenta y devuelva `Wst-` + parte antes de la `@` + `-26`.
   - Si la parte local resultara muy corta (<3 caracteres), completar con el teléfono normalizado o un hash estable para que la clave cumpla el mínimo de 6 caracteres de Auth.

2. `supabase/functions/import-clientes/index.ts`
   - Pasar el email ya resuelto (incluida la variante con sufijo si hubo colisión) a `buildProvisionalPassword(email)` antes de crear el usuario.
   - Mantener el retorno de `password_provisional` en el resultado del commit y el flag `must_change_password: true`.

3. Desplegar la función y verificar con una importación de prueba de 1 fila que la clave devuelta coincida con el patrón.

Sin cambios de base de datos ni de UI.

## Nota importante (seguridad)

Esta clave es **predecible**: cualquiera que conozca el patrón y el email puede deducirla. Es exactamente el hallazgo `predictable_provisional_pwd` que se corrigió antes. Lo implemento como pides, y queda mitigado en parte porque el guard de auth obliga a cambiar la contraseña en el primer ingreso (`must_change_password`). Recomiendo mantener ese bloqueo activo siempre.
