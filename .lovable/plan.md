# Recuperar contraseña en cuentas creadas en lote

## Causa real (verificada)

De 529 cuentas, **523 tienen email de acceso provisional** terminado en `@clientes-temp.local`. Ese buzón no existe: el enlace de recuperación se genera y se envía, pero no puede llegar a ningún lado. En las cuentas manuales sí funciona porque tienen un email real.

Además, el diálogo de "olvidé mi contraseña" solo acepta email, mientras que estas cuentas entran con **usuario**, así que el cliente no tiene qué escribir ahí.

## Qué se va a hacer

### 1. Recuperación por usuario o email
El campo pasa a ser "Usuario o email", igual que el login. Si se escribe un usuario, el servidor lo traduce al email de acceso y dispara el enlace. La respuesta al cliente es siempre la misma, exista o no la cuenta (no se revela quién está registrado).

### 2. Aviso claro cuando no hay email real
Si la cuenta tiene email provisional, no se finge un envío. Se muestra un mensaje concreto:
"Tu cuenta todavía no tiene un correo real registrado, así que no podemos enviarte el enlace. Escribinos y lo activamos" con el contacto de Westone y, si el cliente tiene celular registrado, un botón de WhatsApp directo al equipo.

Queda registrada la solicitud para que el admin la vea (auditoría: `recuperacion_sin_email`).

### 3. Panel admin: resolver estos casos en dos clics
En la ficha de cliente (y en la lista, para las cuentas con email provisional):

- **Registrar email real y enviar enlace**: usa el flujo de cambio de email que ya existe; al quedar aplicado, dispara el correo de recuperación al email nuevo.
- **Regenerar clave provisional**: vuelve a poner la cuenta en estado provisional con nueva clave y `must_change_password`, y abre la vista previa de onboarding ya existente (WhatsApp / email) para reenviarle las credenciales manualmente. Es el camino para los clientes que no tienen ni van a dar email.

### 4. Solicitudes de recuperación pendientes
Bloque nuevo en el panel admin con las cuentas que intentaron recuperar y no tienen email real: negocio, usuario, celular, fecha del intento y las dos acciones de arriba a mano.

## Detalles técnicos

- Función de servidor `request-password-reset`: acepta usuario o email, resuelve el perfil con service role, detecta email provisional, y solo en ese caso devuelve `sin_email: true`; si hay email real llama al envío nativo de recuperación. Respuesta uniforme, CORS y validación con Zod.
- Función de servidor `reset-provisional-password` (solo admin / super admin): genera clave aleatoria con el mismo estándar actual, la aplica y marca `must_change_password`, con auditoría.
- Migración: tabla `password_recovery_requests` (usuario, perfil, canal detectado, estado, fecha), RLS por `auth.uid()` + `is_admin()`, GRANT a `authenticated` y `service_role`.
- Frontend: `Login.tsx` (campo y estados del diálogo), `AuthContext` (`requestPasswordReset` pasa por la función de servidor), `admin/Clientes.tsx` + `ClientesTabla.tsx` (acciones) y un componente nuevo para las solicitudes pendientes.

## QA

- Cuenta manual con email real: llega el enlace y se cambia la clave.
- Cuenta en lote por usuario: aparece el aviso de "sin correo real" y queda registrada la solicitud.
- Misma cuenta después de registrarle email real desde admin: llega el enlace y entra con la clave nueva.
- Regeneración de clave provisional: la vista previa muestra la clave nueva y el cliente entra con ella, forzando cambio.
- Usuario inexistente: mensaje idéntico al caso válido.
- Las cuentas de prueba se borran al terminar.
