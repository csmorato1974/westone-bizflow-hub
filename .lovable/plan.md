# Corrección de la alerta de perfiles pendientes

## Diagnóstico (confirmado en BD)

Yago Franco aparece como pendiente porque su ficha tiene:
- `vendedor_id`: ✅ asignado (Sergio Morón)
- `lista_precio_id`: ✅ asignada
- `direccion`: ❌ **NULL** ← único motivo que dispara la alerta

El sistema **sí funciona**, pero el criterio actual trata la dirección como obligatoria, cuando en la práctica es un dato secundario que se completa luego de la asignación inicial.

## Cambios

### 1. Reclasificar motivos en `src/pages/Dashboard.tsx`

Dividir los motivos en dos niveles:

**Críticos** (disparan la alerta roja parpadeante):
- `sin_rol` — usuario sin ningún rol
- `sin_ficha` — rol cliente sin registro en `clientes`
- `sin_lista` — cliente sin lista de precios
- `sin_vendedor` — cliente sin vendedor asignado

**Opcionales / informativos** (NO disparan alerta, pero se muestran como advertencia ámbar dentro del popover si el perfil ya tiene otro motivo crítico):
- `sin_direccion` — dato comercial complementario

### 2. Lógica de filtrado

```ts
const CRITICOS: Motivo[] = ["sin_rol", "sin_ficha", "sin_lista", "sin_vendedor"];
const tieneCritico = motivos.some(m => CRITICOS.includes(m));
if (tieneCritico) perfiles.push({ ..., motivos });
```

Resultado esperado tras el fix:
- **Yago Franco** → desaparece de la alerta (ya tiene rol, ficha, lista y vendedor).
- **Calberto Solmo / Alberto Morato** → siguen sin marcar (vendedores, no requieren ficha).
- Cualquier cliente nuevo sin lista o sin vendedor → sigue alertando como crítico.

### 3. Detectar también fichas huérfanas (`clientes.user_id IS NULL`)

Hay una ficha `4e70949e…` con `user_id` nulo (sin login vinculado). Añadir un motivo `ficha_sin_usuario` y listarlas en el popover bajo una sección "Fichas sin usuario" con botón "Vincular" → `/app/admin/clientes?focus={cliente_id}`. Estas SÍ son críticas porque no podrán ingresar al sistema.

### 4. Visual del popover

- Badges rojos para motivos críticos.
- Badge ámbar pequeño "Sin dirección" cuando aplique, sólo como info adicional.
- Si un perfil sólo tiene motivos opcionales → no aparece en el popover.

## Archivos a modificar

- `src/pages/Dashboard.tsx` — reclasificación de motivos, filtrado por críticos, query adicional de fichas huérfanas, badges diferenciados.

No se requieren migraciones de BD.
