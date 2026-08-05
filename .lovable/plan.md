# Recuperación de contraseña en cuentas creadas en lote

## Estado real (verificado en la base)

- 523 de 529 cuentas siguen con email de acceso provisional `@clientes-temp.local`. Ese buzón no existe, así que ningún enlace de recuperación puede llegar: no es un fallo del envío, es que no hay correo real donde enviarlo.
- El flujo de recuperación por usuario o email ya está funcionando y detecta estos casos (hay 3 solicitudes registradas, 1 pendiente), pero **la bandeja de solicitudes pendientes en el panel admin nunca se construyó**, así que esos pedidos quedan invisibles.
- Nada obliga al cliente a registrar un correo real cuando entra con la clave provisional, así que la cuenta sigue sin poder recuperarse la próxima vez.
- El proyecto no tiene dominio de envío propio configurado: los correos de autenticación salen con el remitente genérico por defecto, lo que aumenta la probabilidad de que caigan en spam incluso cuando el email sí es real.

## Qué se va a hacer

### 1. Pedir el correo real en el primer acceso (raíz del problema)
En la pantalla de cambio obligatorio de contraseña, además de la clave nueva se pide el correo real del cliente:
- Campo "Tu correo electrónico" con validación y confirmación.
- Al guardar, se dispara el cambio de email por el flujo ya existente y se avisa al cliente que debe confirmar el enlace que recibirá.
- Se puede posponer ("lo hago después"), pero queda un aviso permanente en el perfil: "Sin correo real no podés recuperar tu contraseña".

Con esto cada cliente que entra queda recuperable por sí mismo, sin depender del admin.

### 2. Bandeja de solicitudes de recuperación en el panel admin
Bloque nuevo en Clientes con las solicitudes pendientes: negocio, usuario, celular, fecha del intento y dos acciones a mano:
- **Registrar correo real y enviar enlace** (usa el cambio de email existente y luego dispara la recuperación).
- **Regenerar clave provisional** (ya existe) y abrir la vista previa de onboarding para reenviar credenciales por WhatsApp o email.
Al resolver, la solicitud se marca como atendida y desaparece de la lista.

### 3. Aviso masivo a los clientes en lote
En la lista de clientes con correo provisional, botón para copiar/enviar por WhatsApp un mensaje corto invitando a entrar y registrar su correo, reutilizando las plantillas de onboarding ya escritas.

### 4. Entregabilidad de los correos que sí salen
Recomendación: configurar el dominio de envío propio para que los correos de recuperación salgan a nombre de Westone y no caigan en spam. Queda como paso opcional a confirmar; si se aprueba, se abre el asistente de configuración de dominio y se sube el límite horario de envío de correos de autenticación.

## Detalles técnicos

- `src/pages/CambiarPassword.tsx`: agregar campo de email + invocación a `request-email-change`, estados de error y mensaje de confirmación.
- Nuevo componente `src/components/admin/SolicitudesRecuperacion.tsx`: lee `password_recovery_requests` (estado `pendiente`) con join a `profiles`/`clientes`, acciones que llaman a `request-email-change` y `reset-provisional-password`, y actualizan `estado`/`resuelto_por`/`resuelto_en`.
- `src/pages/admin/Clientes.tsx`: montar la bandeja y el botón de aviso masivo.
- `src/lib/onboarding.ts`: plantilla corta "registrá tu correo".
- Sin migraciones nuevas: la tabla y las políticas ya existen.

## QA

- Cliente en lote entra con clave provisional, registra su correo, confirma el enlace y luego recupera contraseña por sí mismo.
- Cliente que posterga: ve el aviso en el perfil y sigue funcionando el acceso.
- Solicitud pendiente actual aparece en la bandeja admin y se resuelve con cada una de las dos acciones.
- Cuenta con correo real: el enlace llega y permite cambiar la clave.
- Cuentas de prueba creadas para QA se eliminan al finalizar.
