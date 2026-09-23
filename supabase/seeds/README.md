# Seeds manuales — STAGING/UAT ONLY

Estos archivos **no son migraciones**. No se aplican automáticamente ni forman
parte del historial de migraciones. Se ejecutan **a mano** y **solo** en el
entorno de staging.

## `uat_dataset.sql`

Dataset mínimo para pruebas manuales (UAT):

| Producto | SKU | Variante | SKU variante | Stock inicial | Precio |
|---|---|---|---|---|---|
| UAT Refrigerante Azul | UAT-REF-001 | 1L | UAT-REF-001-1L | 100 | Bs 22 |
| UAT Refrigerante Azul | UAT-REF-001 | 4L | UAT-REF-001-4L | 40 | Bs 75 |
| UAT DEF Prueba | UAT-DEF-001 | 10L | UAT-DEF-001-10L | 30 | Bs 95 |

Lista de precios: **UAT Lista Base** (activa).

### Cómo usarlo

1. Confirmar que el backend destino es el de **staging**.
2. Abrir el editor SQL del backend de staging.
3. Pegar el contenido completo de `uat_dataset.sql` y ejecutarlo.
4. Verificar en la app: Productos, Stock y Listas de Precios.

Se puede ejecutar tantas veces como se quiera: no duplica nada.

### Idempotencia

- Productos: `ON CONFLICT (sku)`.
- Variantes: `ON CONFLICT (producto_id, presentacion)`.
- Stock: `ON CONFLICT (variante_id) DO NOTHING` — crea lo que falta y **nunca**
  sobreescribe stock existente (podría tener reservas/consumos de pruebas).
- Lista de precios: `nombre` no tiene restricción única, así que se inserta solo
  si no existe (`WHERE NOT EXISTS`).
- Precios: `ON CONFLICT (lista_id, variante_id) DO UPDATE`.

### Reset UAT (opcional)

Al final del archivo hay un bloque **comentado** de reset que devuelve el stock
UAT a sus valores iniciales y pone reservado a 0. Es destructivo sobre el estado
de pruebas: descomentar y ejecutar solo a propósito.

## Qué NO hacer

- **No ejecutar en producción**, bajo ninguna circunstancia.
- No convertir estos archivos en migraciones ni moverlos a `supabase/migrations/`.
- No usar estos productos, variantes o precios en datos reales de clientes.
- No borrar filas ajenas para "limpiar": el seed nunca lo hace.
