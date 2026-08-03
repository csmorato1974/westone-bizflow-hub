# Westone — bloque integral: acceso, email confiable, username, onboarding y actividad comercial

## Estado actual (verificado)

- `profiles` tiene: id, full_name, phone, email, created_at, updated_at, avatar_url, email_provisional, must_change_password. **No** existe `username`.
- La sincronización de `profiles.email` hoy ocurre como parche al abrir el perfil personal; si el usuario no vuelve a entrar, queda desalineado con la cuenta de acceso.
- La ficha de cliente en admin escribe el email sin tocar la cuenta de acceso, así que puede dejar perfil y cuenta distintos.
- Hay 526 clientes y 0 pedidos registrados: la actividad comercial arrancará en cero y su valor real aparecerá cuando existan pedidos (o cuando se cargue histórico).
- El módulo de mensajes ya tiene plantilla `bienvenida` editable, reutilizable para el mensaje de onboarding.

## Bloque 1 — Email de acceso confiable (prioridad máxima)

- La cuenta de acceso es la única fuente de verdad. `profiles.email` se sincroniza con un disparador en base de datos cuando el email de la cuenta cambia de verdad (al confirmar el enlace), en la misma transacción, ajustando `email_provisional`.
- Se elimina el parche de reconciliación al cargar el perfil; el frontend deja de escribir el email final como si estuviera confirmado.
- Nueva tabla `email_change_requests`: usuario, actor que solicita, email anterior, email nuevo, estado (pendiente / confirmada / cancelada / expirada), fechas. RLS: cada usuario ve las suyas; admin y super admin ven todas.
- Función de servidor `request-email-change`: valida permiso (dueño, admin o super admin), valida disponibilidad del email, dispara el cambio por backend con envío de correo al nuevo email, y crea la solicitud pendiente. Cubre por igual Perfil personal y ficha admin.
- Reenvío y cancelación de la solicitud pendiente, ambos por la misma función de servidor.
- UI: se muestra "email confirmado" y, si aplica, "pendiente de confirmación: nuevo@correo" con botones reenviar / cancelar, en Perfil y en la ficha de cliente admin.
- Auditoría: `solicitar_cambio_email`, `reenviar_cambio_email`, `cancelar_cambio_email`, `confirmar_cambio_email` (esta la escribe el disparador, no el navegador) y `reconciliar_email`.

## Bloque 2 — Reconciliación de lo ya inconsistente

- Función de servidor `reconciliar-emails`, solo super admin: recorre las cuentas, compara con `profiles.email`, corrige el perfil tomando la cuenta como verdad, registra auditoría y devuelve informe (total revisado, corregidos, con cambio pendiente).
- Se ejecuta una vez tras el despliegue y queda como botón en administración con el informe visible.

## Bloque 3 — Username único

- Nueva columna `profiles.username`: única sin distinguir mayúsculas, formato `a-z 0-9 . _ -`, 3 a 30 caracteres, validada por disparador.
- Verificación de disponibilidad con una función de base de datos que solo responde sí/no, sin exponer datos de otros usuarios.
- Editable desde Perfil y desde la ficha de cliente en admin (admin corrige el de otros).
- Se reservan nombres genéricos (`admin`, `superadmin`, `root`, `soporte`, `westone`, etc.) para que no queden compartidos ni reutilizados.
- Backfill: se genera username único para todas las cuentas existentes, derivado del nombre de negocio normalizado, con desambiguación numérica ante colisión. Los generados quedan marcados como provisionales.

## Bloque 4 — Login por usuario o email

- El formulario pasa a pedir "Usuario o email". Con `@` se usa tal cual; sin `@`, la función de servidor `resolve-login` traduce el username al identificador de acceso.
- La función nunca autentica y responde igual exista o no el usuario; la contraseña siempre la valida el sistema de autenticación. Los errores de acceso son genéricos y no revelan existencia de cuentas.

## Bloque 5 — Onboarding de cuentas importadas

- Todo lo creado por importación queda provisional: email provisional, username provisional, contraseña provisional (se mantiene la clave provisional actual) y `must_change_password = true`.
- Secuencia obligada: primer login → cambio de contraseña → `/completar-perfil` → panel.
- Nueva pantalla `/completar-perfil`: revisar o cambiar el username provisional y registrar el email real, que entra por el flujo de confirmación del Bloque 1 (se accede al panel con el aviso de confirmación pendiente visible).
- Mensajes de onboarding por dos canales: email con el mismo estándar del alta manual, y WhatsApp/DM usando la plantilla `bienvenida` existente. Ambos incluyen enlace de acceso, username provisional, clave provisional, instrucción de cambio de contraseña e instrucción de completar perfil.
- Trazabilidad de onboarding por cuenta, visible para admin y super admin, con estados: pendiente, mensaje_enviado, primer_login, password_actualizada, username_actualizado, email_pendiente, completado. Los estados se derivan de hechos reales (envío registrado, último acceso, banderas del perfil, solicitud de email abierta), no de marcas manuales.

## Bloque 6 — Email comercial vs email de acceso

- `clientes.email` queda explícitamente como dato comercial/CRM; el email de acceso vive en la cuenta y en `profiles`.
- Editar el email comercial no toca el acceso. La UI los separa visualmente y avisa cuando difieren, con acción directa para pedir el cambio de email de acceso si eso es lo que se buscaba.

## Bloque 7 — Actividad comercial de clientes

- Nuevas columnas de actividad en `clientes`: primera compra, última compra, cantidad de compras, total comprado, estado de actividad y fecha de última actualización.
- Recalculadas desde los pedidos por una función de base de datos: la identidad principal sigue siendo el negocio; si hay ambigüedad al vincular pedidos a un cliente, no se actualiza y el caso va a revisión.
- Refresco individual desde la ficha y masivo desde administración, ambos limitados a admin y super admin, con auditoría de cada actualización.
- Bloque de actividad en la ficha del cliente y filtros por estado de actividad en los listados admin.

## Detalles técnicos

- Migraciones: `profiles.username` + índice único sobre `lower(username)`; tabla `email_change_requests`; columnas de actividad en `clientes`; tabla/estado de onboarding; disparador sobre la tabla de cuentas para sincronizar y auditar el email; funciones de validación de username y de disponibilidad; función de recálculo de actividad. Todas las tablas nuevas con GRANT a `authenticated` y `service_role`, RLS por `auth.uid()` y `is_admin()`, funciones `SECURITY DEFINER` con `search_path = public` y sin ejecución para visitantes anónimos, siguiendo el patrón ya usado.
- Funciones de servidor nuevas: `request-email-change`, `resolve-login`, `reconciliar-emails`, `enviar-onboarding`, `refrescar-actividad-clientes`. Todas validan el token en código, usan CORS y validan entrada con Zod.
- Frontend: `RequireAuth` gana la puerta de "completar perfil"; `AuthContext` expone `username` y `emailPendiente`; se ajustan `Login.tsx`, `Perfil.tsx`, `CompletarPerfil.tsx` (nueva), `admin/Clientes.tsx`, `admin/Usuarios.tsx`, `admin/Whatsapp.tsx` y `App.tsx`.
- La importación en lote asigna username provisional derivado del nombre de negocio con desambiguación numérica.

## QA

Pruebas demostrables, con resultados reportados al final: alta manual; cambio de email desde perfil; cambio de email desde admin; reenvío y cancelación; reconciliación; username (formato, colisiones, edición, backfill, nombres reservados); login por username y por email; cuenta importada recorriendo todo el onboarding; actividad comercial con refresco individual y masivo. Las cuentas de prueba se eliminan al terminar.

## Fuera de alcance

- Cambiar el esquema de contraseñas provisionales.
- Recuperación de acceso por username sin email real (sin email no hay a dónde enviar el enlace).
- Carga de histórico de compras: hoy no hay pedidos en la base, así que la actividad arrancará en cero hasta que existan pedidos o se importe histórico (eso sería un pedido aparte).
