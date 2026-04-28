# Plan para corregir la alerta de configuración pendiente

## Diagnóstico confirmado

La falla actual tiene dos causas separadas:

1. En el dashboard, el cálculo ya no debería seguir marcando a Yago Franco: en la base de datos tiene rol `cliente`, ficha vinculada, lista de precios, vendedor y dirección. Hoy el único pendiente real detectado por esa lógica es una ficha huérfana: `Coco Gas`.
2. La experiencia sigue viéndose “mal” porque hay inconsistencia entre pantallas:
   - `Dashboard.tsx` ya trata `sin_direccion` como informativo.
   - `Usuarios.tsx` todavía usa `fichaCompleta = direccion + lista + vendedor`, así que sigue mostrando pendientes con la lógica vieja.
3. Además, el popover del dashboard sigue arrojando warnings de refs con Radix, lo que puede romper o volver inestable la interacción.

## Qué voy a corregir

### 1. Unificar la definición de “pendiente”
Crear una sola regla de negocio y aplicarla en ambas vistas:

**Crítico (sí dispara alerta):**
- sin rol
- cliente sin ficha
- cliente sin lista de precios
- cliente sin vendedor
- ficha sin usuario vinculado

**Informativo (no dispara alerta por sí solo):**
- sin dirección

Resultado esperado:
- Yago Franco no debe aparecer como pendiente.
- Un cliente nuevo sin lista o sin vendedor sí debe aparecer.
- Una ficha huérfana sí debe aparecer.
- Un cliente al que solo le falta dirección no debe activar la alerta roja.

### 2. Corregir `src/pages/admin/Usuarios.tsx`
Actualizar `esPendiente` y `fichaCompleta` para que dejen de considerar la dirección como requisito crítico.

También ajustaré el filtro `?filter=pendientes` para que muestre exactamente los mismos casos que el dashboard.

### 3. Corregir el popover del dashboard
Reestructurar el trigger de la alerta para evitar conflictos con Radix y con el `<Link>` de la tarjeta.

Objetivo:
- que el badge abra el popover de forma estable,
- que no navegue accidentalmente al hacer click,
- que desaparezcan los warnings de refs en consola.

### 4. Mantener la navegación contextual
Conservar el comportamiento actual de resolución:
- problemas de ficha/comerciales → `Clientes`
- problemas de rol/usuario → `Usuarios`

Pero con la lógica ya corregida para que los destinos coincidan con lo que realmente falta configurar.

## Archivos a modificar

- `src/pages/Dashboard.tsx`
- `src/pages/admin/Usuarios.tsx`

## Detalles técnicos

- Extraeré o replicaré una lógica consistente de evaluación de motivos para evitar divergencias entre pantallas.
- Revisaré el uso de `PopoverTrigger asChild` y la ubicación del badge respecto al `Link` de la card para asegurar compatibilidad con refs y eventos.
- No se requieren cambios de base de datos ni migraciones.

## Validación esperada

Después del ajuste:
- la alerta del dashboard solo contará pendientes críticos reales,
- el filtro “Pendientes de configurar” en Usuarios mostrará el mismo conjunto,
- el popover abrirá correctamente sin warnings de refs.