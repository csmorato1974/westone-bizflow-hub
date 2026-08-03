# Autenticación consistente: email sincronizado + login por nombre de usuario

## Objetivo

1. Que el cambio de email deje de producir estados inconsistentes entre la cuenta de acceso y la ficha del perfil.
2. Que el inicio de sesión no dependa del email: agregar nombre de usuario único.

## Estado actual (verificado)

- `profiles` no tiene columna `username` (columnas actuales: id, full_name, phone, email, created_at, updated_at, avatar_url, email_provisional, must_change_password).
- El cambio de email personal en el perfil ya envía el correo de confirmación y registra auditoría, pero la sincronización de `profiles.email` ocurre solo cuando el usuario vuelve a abrir su perfil (código de reconciliación dentro de la carga de la página). Si nunca vuelve a entrar, queda desincronizado.
- La ficha de cliente en admin escribe el email directamente en `clientes`/`profiles` sin tocar la cuenta de acceso, por lo que ahí sí se puede quedar el perfil con un email que la cuenta no tiene.
- No se pudo medir desde aquí cuántos perfiles están desincronizados (el listado de cuentas de acceso no es consultable con permisos de solo lectura); el conteo se hará dentro de la reconciliación del paso 5, que corre con permisos de servicio y deja el resultado en el reporte.

## Qué se va a construir

### 1. Sincronización automática y confiable del email
- Disparador en la base de datos sobre la tabla de cuentas de acceso: cuando el email de la cuenta cambia (es decir, cuando el usuario confirma el enlace), se actualiza `profiles.email` en la misma transacción y se marca `email_provisional` según corresponda.
- Con eso, `profiles.email` deja de depender de que el usuario abra su perfil.
- Se elimina la lógica de "parche al cargar el perfil" y se deja solo la lectura del estado.

### 2. Estado "pendiente de confirmación" visible
- Nueva tabla `email_change_requests` (usuario, email anterior, email nuevo, estado, fechas) con RLS: cada usuario ve sus propias solicitudes; admin y super admin ven todas.
- El perfil personal y la ficha de cliente en admin muestran el aviso "pendiente de confirmación: nuevo@correo" mientras la solicitud esté abierta, con opción de reenviar o cancelar.
- El disparador del punto 1 cierra la solicitud como confirmada al detectar el cambio efectivo.

### 3. Cambio de email desde la ficha de cliente (admin)
- Deja de escribir el email de la cuenta directamente. En su lugar, una función de servidor `request-email-change` (admin/super admin) valida el permiso, verifica que el email no esté en uso, dispara el correo de confirmación al nuevo email y crea la solicitud pendiente.
- El campo email de `clientes` (dato comercial) se sigue pudiendo editar aparte, pero se muestra advertencia cuando difiere del email de acceso.

### 4. Auditoría
- Se registra en `audit_logs`: `solicitar_cambio_email`, `confirmar_cambio_email`, `cancelar_cambio_email`, `reconciliar_email`, cada uno con quién, cuándo, email anterior y email nuevo. Las confirmaciones las escribe el disparador de base de datos (no dependen del navegador).

### 5. Corrección de los casos ya inconsistentes
- Función de servidor `reconciliar-emails` (solo super admin): recorre las cuentas, compara con `profiles.email`, toma la cuenta de acceso como fuente de verdad, corrige el perfil, registra auditoría y devuelve un informe (total, corregidos, con cambio pendiente).
- Se ejecuta una vez tras el despliegue y queda disponible como botón en el módulo de administración.

### 6. Nombre de usuario (username)
- Nueva columna `username` en `profiles`, única sin distinguir mayúsculas, formato `a-z 0-9 . _ -`, 3 a 30 caracteres, validada por disparador.
- Editable desde el perfil personal y desde la ficha de cliente en admin (admin puede corregir el de otros).
- Verificación de disponibilidad en vivo mediante una función de base de datos `username_disponible(texto)` que solo responde sí/no, sin exponer datos de otros usuarios.

### 7. Login con username o email
- El formulario de acceso pasa a pedir "Usuario o email".
- Si el valor contiene `@`, se usa tal cual. Si no, una función de servidor `resolve-login` traduce el username a la cuenta correspondiente y devuelve únicamente el identificador necesario para el acceso; no expone emails a quien no está autenticado.
- La contraseña se sigue validando siempre contra el sistema de autenticación; la función de resolución nunca autentica por sí misma.

### 8. Completar perfil en el primer acceso (cuentas importadas)
- Nueva pantalla `/completar-perfil`: pide nombre de usuario y email real, y se muestra antes del panel cuando el perfil tiene email provisional o no tiene username.
- El email real entra por el flujo de confirmación del punto 2: se accede al panel al guardar el username, con el aviso de confirmación pendiente visible hasta que se confirme.
- Se encadena con el cambio de contraseña obligatorio ya existente: primero contraseña, después completar perfil.

## Detalles técnicos

- Migración: columna `profiles.username` + índice único sobre `lower(username)`; tabla `email_change_requests` con GRANT a `authenticated` y `service_role`, RLS por `auth.uid()` y `is_admin()`; disparador sobre la tabla de cuentas para sincronizar y auditar; función `username_disponible` y disparador de validación de formato, ambos `SECURITY DEFINER` con `search_path = public` y sin permiso de ejecución para visitantes anónimos, siguiendo el patrón ya usado en el sistema.
- Funciones de servidor nuevas: `request-email-change`, `resolve-login`, `reconciliar-emails`. Todas validan el token en el código, usan CORS y validan la entrada con Zod.
- Frontend: `RequireAuth` gana la puerta de "completar perfil"; `AuthContext` expone `username` y `emailPendiente`; `Login.tsx`, `Perfil.tsx`, `admin/Clientes.tsx` y `App.tsx` se ajustan.
- La importación en lote seguirá creando cuentas con email provisional; se le asignará un username sugerido derivado del nombre de negocio, con desambiguación numérica si ya existe.

## Fuera de alcance

- Cambiar el sistema de contraseñas provisionales.
- Recuperación de acceso por username sin email (sin email real no hay a dónde enviar el enlace).
