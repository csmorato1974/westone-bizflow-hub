## Diagnóstico

En `src/pages/admin/Stock.tsx` cada presentación se edita con un único `<Input type="number">`. Los **spinners nativos** del navegador (las flechitas arriba/abajo) son muy pequeños, sólo se ven al enfocar el campo, y en algunos navegadores (Safari/móviles) directamente no aparecen. Por eso ahora "no se puede" ajustar con flechas — el control existe pero es prácticamente invisible.

No hubo regresión en CSS ni en lógica: el `save()` y la actualización optimista funcionan bien. Lo que falta es un **control visual explícito** independiente del navegador.

## Solución propuesta

Reemplazar el input plano por un **stepper compacto** en cada fila de variante dentro de `src/pages/admin/Stock.tsx`:

- Botón **−** (icono `Minus`) a la izquierda → resta 1 (mínimo 0).
- `<Input type="number">` central, editable manualmente como hasta ahora.
- Botón **+** (icono `Plus`) a la derecha → suma 1.
- Botón **Guardar** (icono `Save`, ya existente) sólo se habilita cuando el valor difiere del actual (`dirty`), igual que ahora.

Detalles:
- Los botones +/− actualizan `edits[v.id]` (no guardan automáticamente) → el usuario ve el cambio pendiente con el borde resaltado y confirma con Guardar, manteniendo el flujo actual y el registro de auditoría.
- Si el campo está vacío (`NaN`), +/− parten desde `v.cantidad`.
- Se conserva la actualización optimista, el `logAudit("ajuste_stock_variante", …)` y el `load()` posterior — sin tocar la base de datos ni RLS.
- Los iconos `Plus` y `Minus` se importan desde `lucide-react` (ya en uso en el proyecto).

## Archivos a modificar

- `src/pages/admin/Stock.tsx` — añadir botones +/− alrededor del input numérico de cada variante.

No se requieren cambios de base de datos, edge functions ni dependencias nuevas.