## Objetivo

Permitir subir archivos Excel (`.xlsx`/`.xls`) además de CSV/TSV en el módulo "Importar clientes".

## Cambios

1. **Librería de lectura de Excel**
   - Añadir `xlsx` (SheetJS) al proyecto para leer el archivo en el navegador.

2. **Carga de archivo** (`src/pages/admin/ImportarClientes.tsx`)
   - Ampliar `accept` del input a `.csv,.txt,.xlsx,.xls`.
   - En `onFile`: si la extensión es Excel, leer como `ArrayBuffer`, tomar la **primera hoja**, convertirla a texto delimitado (CSV) y usar el mismo flujo de validación actual; si es CSV/TXT, seguir con `file.text()`.
   - Mostrar un aviso si el libro tiene varias hojas indicando que se usa la primera.
   - Actualizar textos: pestaña "Subir archivo (CSV o Excel)" y descripción del módulo.

3. **Sin cambios en reglas ni backend**
   - Se reutilizan `parseRows` y las reglas existentes; la edge function y el versionado de reglas quedan intactos.
   - La plantilla descargable sigue siendo CSV (Excel la abre sin problema).

## Notas técnicas

- La conversión Excel → texto delimitado ocurre solo en el cliente, por lo que el troceado en lotes de 20 filas y el manejo de incidencias siguen funcionando igual.
- Celdas con fechas/números se convierten a su representación textual formateada para evitar valores raros en teléfonos y códigos.
