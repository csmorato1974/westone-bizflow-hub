# Auditoría controlada del build externo — sin publicar

## Evidencia confirmada

- El entorno interno tiene presentes `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; `.env` es local y no está versionado.
- La URL publicada `https://westone-bizflow-hub.lovable.app/` sirve actualmente `/assets/index-DWog-5iS.js`, no `index-C4CTlVIl.js`.
- Ese bundle contiene la referencia, URL y clave pública del backend vinculado `ickw…eabi` (valores completos no expuestos).
- Una prueba en navegador limpio de la URL publicada renderiza WESTONE e “INICIAR SESIÓN”, sin `supabaseUrl is required` y sin errores de consola.
- La cadena literal `supabaseUrl is required` aparece dentro del código de la librería, pero no se ejecuta: su presencia por sí sola no demuestra que falte la URL.
- La URL externa de preview protegida responde 401 sin acceso válido y no se pudo completar una carga autenticada; por ello todavía no está demostrado que use el mismo ámbito de variables que el preview interno.

## Plan de verificación

1. Registrar como línea base el bundle, cabeceras y resultado visual de cada URL accesible, sin modificar archivos.
2. Auditar el preview externo protegido con una sesión válida de Lovable y capturar:
   - nombre exacto del bundle o módulos servidos;
   - presencia/ausencia de las tres variables en tiempo de compilación, sin revelar valores;
   - coincidencia enmascarada con el backend `ickw…eabi`;
   - contenido de `#root` y errores reales de consola.
3. Comparar el ámbito del preview interno, preview externo y URL publicada. No asumir que comparten variables hasta observar los tres.
4. Si el preview externo realmente carece de variables, buscar únicamente una acción de plataforma que re-vincule o regenere ese preview sin commit, publicación, despliegue ni edición de archivos.
5. Aplicar criterio **NO-GO** si esa acción no existe o si exige publicar: no cambiar código, `.env`, configuración, base de datos ni Raiola.
6. Si existe una regeneración segura y aislada, ejecutarla una sola vez y comprobar que cambió el nombre o timestamp del recurso.
7. Repetir la prueba limpia y entregar el reporte solicitado: URL, bundle antes/después, variables presentes/ausentes, regeneración, archivos tocados, publicación, base de datos, resultado visual y errores restantes.

## Límites

- No se tocarán `src/`, `supabase/`, `.gitignore`, `.env`, datos ni configuración funcional.
- No se publicará, desplegará ni modificará Raiola.
- No se expondrán claves completas.
- Con la evidencia actual no procede corregir la URL publicada: ya recibe las variables y funciona correctamente.
