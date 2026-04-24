

# Activar tu cuenta como super_admin

## Acciones
1. Asignarte el rol `super_admin` insertando en `user_roles`:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('1c210c34-bc35-4fee-b222-749f40754f3a', 'super_admin');
   ```
2. Mejorar el mensaje de la pantalla de registro en `src/pages/Login.tsx` para que diga claramente: "Cuenta creada. Revisa tu email para confirmar la cuenta. Después, un administrador debe asignarte un rol antes de acceder."

## Lo que NO se cambia
- La confirmación por email se mantiene activa (más seguro para producción).

## Pasos para ti
1. Confirma el email enviado a `csmorato@gmail.com` (revisa también spam).
2. Inicia sesión en `/login`.
3. Ve a **Admin → Usuarios y Roles** para asignar roles a futuros usuarios (vendedor, cliente, logística, admin) una vez que confirmen su correo.

## Flujo de validación para nuevos usuarios
```text
Registro en /login
      ↓
Confirma email (link recibido)
      ↓
Inicia sesión → ve "No autorizado"
      ↓
Tú (super_admin) le asignas rol en Admin → Usuarios y Roles
      ↓
Recarga y accede a su panel
```

