## Objetivo

Aplicar el formato de clave provisional `Wst-<parte-local-del-email>-26` a las **496 cuentas existentes** que hoy tienen `email_provisional = true` y `must_change_password = true` (las creadas por importación con contraseña aleatoria).

## Qué haré

1. Crear una función de servidor temporal `reset-provisional-passwords` (solo super admin, valida el JWT y el rol antes de hacer nada).
2. La función:
   - Lista los perfiles con `email_provisional = true` y `must_change_password = true`.
   - Para cada uno calcula `Wst-<local>-26` a partir de su email (misma regla que usa la importación, con saneado de caracteres).
   - Actualiza la contraseña en el sistema de autenticación y deja `must_change_password = true` para forzar el cambio en el primer ingreso.
   - Procesa por lotes (p. ej. 50 cuentas por llamada) para evitar timeouts, devolviendo cuántas actualizó y cuáles fallaron.
3. Ejecutarla en lotes hasta cubrir las 496 cuentas y verificar el resultado.
4. Eliminar la función temporal al terminar (igual que hicimos con la purga), para no dejar un endpoint que pueda resetear claves masivamente.

## Notas

- No cambia emails ni datos de cliente; solo la contraseña.
- Las cuentas de admin/super admin y cualquier cuenta con email real no provisional quedan intactas.
- Si preferís conservar la función (con botón en Usuarios para resetear una cuenta individual) en vez de borrarla, decímelo y la dejo instalada con ese alcance.
