## Objetivo

Permitir a los usuarios recuperar su contraseña cuando la han olvidado, mediante un enlace enviado por email.

## Flujo de usuario

1. En `/login`, el usuario hace clic en **"¿Olvidaste tu contraseña?"** (debajo del campo de contraseña).
2. Se abre un diálogo donde ingresa su email y recibe un correo con un enlace de recuperación.
3. Al hacer clic en el enlace, llega a `/reset-password` (ruta pública).
4. Allí establece su nueva contraseña (mínimo 8 caracteres, con confirmación).
5. Tras guardar, queda autenticado y se redirige a `/app`.

## Cambios técnicos

### 1. `src/contexts/AuthContext.tsx`
Agregar dos métodos al contexto:
- `requestPasswordReset(email)` → llama a `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${window.location.origin}/reset-password })`.
- `updatePassword(newPassword)` → llama a `supabase.auth.updateUser({ password })`.

### 2. `src/pages/Login.tsx`
- Agregar enlace **"¿Olvidaste tu contraseña?"** debajo del campo de contraseña en la pestaña "Iniciar sesión".
- Implementar un `Dialog` con un input de email y botón "Enviar enlace de recuperación".
- Mostrar confirmación visual (Alert verde) cuando el correo se envía correctamente, indicando que revisen su bandeja de entrada y spam.

### 3. Nueva página `src/pages/ResetPassword.tsx`
- Ruta pública (sin `RequireAuth`).
- Detecta el token de recuperación desde el hash de la URL (Supabase lo procesa automáticamente al cargar mediante `onAuthStateChange` con evento `PASSWORD_RECOVERY`).
- Muestra formulario con: nueva contraseña, confirmar contraseña, ambos con toggle mostrar/ocultar.
- Validaciones: mínimo 8 caracteres, ambas coinciden.
- Al guardar exitosamente: toast de éxito y redirección a `/app`.
- Si no hay sesión de recuperación válida (acceso directo a la URL): mostrar mensaje y enlace para volver al login.
- Estilo coherente con `Login.tsx` (mismo logo Westone, gradient, Card industrial).

### 4. `src/App.tsx`
- Importar `ResetPassword` y agregar la ruta pública: `<Route path="/reset-password" element={<ResetPassword />} />`.

## Notas

- Lovable Cloud envía los correos de recuperación automáticamente con plantillas por defecto. No es necesario configurar dominio de email ni plantillas personalizadas para que funcione (eso queda como mejora opcional posterior si se desea branding propio).
- La ruta `/reset-password` debe ser pública para evitar que `RequireAuth` la bloquee antes de que el usuario complete el cambio.
- El listener de `onAuthStateChange` ya existente en `AuthContext` capturará el evento `PASSWORD_RECOVERY` correctamente sin cambios adicionales.