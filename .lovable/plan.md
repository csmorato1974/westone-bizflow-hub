# Plan: Alerta de verificación de email en registro

## Resumen
Agregar una alerta informativa en el formulario de registro (signup) para que el nuevo usuario sepa que debe estar atento al correo de verificación que recibirá para poder acceder a su cuenta.

## Cambios a realizar

### 1. Frontend - `src/pages/Login.tsx`

**Importaciones adicionales:**
- `MailCheck` de `lucide-react`
- `Alert` y `AlertDescription` de `@/components/ui/alert`

**Modificaciones en el formulario de signup:**
- Después del mensaje de éxito actual ("Cuenta creada. Un administrador debe asignarte un rol para acceder."), agregar un componente `Alert` con:
  - Icono `MailCheck`
  - Texto informativo: "Revisa tu bandeja de entrada. Recibirás un email de verificación que debes confirmar para activar tu cuenta."
  - Variante visual que destaque (puede usar estilos de info o un color de marca)

**Ubicación de la alerta:**
- La alerta debe aparecer dentro del área del formulario de signup, visible inmediatamente después de que el usuario envíe el formulario exitosamente, reemplazando o acompañando al toast de éxito.

## Notas técnicas
- Se mantiene el comportamiento actual del toast de éxito
- La alerta es puramente informativa y no requiere cambios en backend
- Se usa el componente `Alert` existente del proyecto para mantener consistencia visual