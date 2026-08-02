## Qué encontré en tu archivo

`Base_de_Clientes_Westone_1.xlsx` (hoja "Hoja1", 536 clientes):
- Una fila vacía arriba y luego los encabezados: `No`, `CIUDAD`, `ZONA`, `DIRECCION`, `NOMBRE TIENDA`, `CONTACTO`, `CELULAR`.
- Ejemplo: `LUBRICANTES BRASIL` / contacto `JULIO` / celular `75255767`.

Hoy el importador no reconoce los encabezados `NOMBRE TIENDA`, `CELULAR`, `ZONA` ni `No`, y su referencia interna principal es el nombre del contacto. Eso hay que cambiar.

## Cambios

1. **Reconocer los encabezados de tu Excel** (`src/lib/importClientes.ts` y copia en `supabase/functions/import-clientes/rules.ts`)
   - Nuevos alias: `nombre_tienda`, `tienda`, `negocio`, `razon` → empresa; `celular`/`cel` → teléfono (ya existe `celular`); `zona`/`barrio` → se anexa a notas; `no`/`nro`/`item` → columna ignorada explícitamente.
   - Detección de encabezado tolerante a filas de preámbulo: se busca la primera fila que contenga al menos 2 encabezados reconocidos (hoy solo mira la primera fila).

2. **Nombre de tienda como referencia principal**
   - En `normalizeRow`, la referencia principal (`nombre`) pasa a ser `empresa` → contacto → email, en ese orden (hoy es contacto → empresa).
   - El nombre del contacto se sigue guardando aparte y va al campo `contacto` de la ficha de cliente; el perfil y el listado muestran la tienda.
   - La clave de trazabilidad y la comparación por similitud usarán el nombre de la tienda, que es más estable entre exportaciones.

3. **Versionado de reglas**
   - Subir `RULES_VERSION` a `1.1.0` en ambos archivos (frontend y edge function) para que no se mezclen lotes con reglas viejas.

4. **UI**
   - En "Importar clientes", la columna de referencia se rotula "Tienda / Negocio" y se muestra el contacto como dato secundario.
   - Nota en la ayuda: se aceptan encabezados `NOMBRE TIENDA` y `CONTACTO`.

## Notas técnicas

- Sin cambios de base de datos: `clientes.empresa` ya guarda la tienda y `clientes.contacto` la persona.
- La detección de duplicados mantiene la jerarquía actual (clave → teléfono → email → nombre+teléfono parcial → similitud), solo cambia qué texto se usa como "nombre".
- Los clientes ya importados con referencia por contacto se re-emparejarán por teléfono, así que una reimportación de esta lista actualizará en lugar de duplicar.
