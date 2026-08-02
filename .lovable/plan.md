## Objetivo

En la importación masiva (altas en lote), el perfil del usuario debe mostrar el **nombre del negocio/empresa** como dato principal de referencia, en lugar del nombre del contacto. El nombre del contacto se sigue guardando en la ficha de cliente (campo Contacto).

## Cambios

1. **Edge function de importación** (`supabase/functions/import-clientes/index.ts`)
   - Al crear la cuenta, los metadatos del usuario usarán `empresa` como nombre visible (con el nombre del contacto como respaldo si no hay empresa).
   - Al crear el perfil, `full_name` = empresa (respaldo: contacto, luego email).
   - Al conciliar un perfil existente sin nombre, se completará también con la empresa.
   - La ficha de cliente no cambia: `empresa` = negocio, `contacto` = persona.

2. **Regla de respaldo**
   - Orden de prioridad para el nombre del perfil: `empresa` → `nombre_completo` → `email`.
   - Filas que solo traen nombre de contacto (sin empresa) siguen funcionando igual que ahora.

## Notas técnicas

- Solo afecta a nuevas importaciones y a perfiles importados que aún no tengan nombre; no reescribe perfiles ya configurados manualmente.
- Si además quieres que se actualicen los perfiles ya importados anteriormente (poner la empresa donde hoy figura el contacto), lo puedo hacer con una actualización puntual de datos — dímelo y lo incluyo.
