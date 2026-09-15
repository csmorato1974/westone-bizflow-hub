# Reconciliación controlada con GitHub `main` — sin publicar

## Estado verificado

- `origin/main` importa `brokeredPreviewStorage` desde `src/integrations/supabase/previewAuthStorage.ts` y lo usa como almacenamiento de sesión.
- `origin/main` también contiene `src/integrations/supabase/previewAuthStorage.ts`.
- La copia local coincide con `origin/main` en esos dos puntos.
- `.gitignore` ya contiene `.env`, `.env.*` y `!.env.example`.
- `.env` existe localmente, no está versionado y las tres variables `VITE_SUPABASE_*` requeridas tienen contenido; no se expondrán sus valores.
- La telemetría disponible no registra actualmente `supabaseUrl is required`; solo muestra avisos no bloqueantes de React Router.

## Decisión aplicada

GitHub `main` es la fuente de verdad elegida. Por ello:

- No se modificará `src/integrations/supabase/client.ts`.
- No se eliminará `src/integrations/supabase/previewAuthStorage.ts`.
- No se modificará `.gitignore`.
- No se modificará `.env` mientras las tres variables sigan presentes.

Retirar el adaptador y usar `localStorage` directamente contradiría el contenido actual de `origin/main`, así que queda fuera del alcance aprobado.

## Verificación segura

1. Confirmar nuevamente que `.env` sigue sin versionarse y conserva las tres variables requeridas, sin mostrar valores.
2. Esperar el resultado automático de compilación del estado actual.
3. Abrir el preview en una sesión limpia de navegador, eliminar únicamente el Service Worker y almacenamiento del dominio de prueba, y recargar.
4. Verificar que `#root` contiene la pantalla inicial de WESTONE y que la consola no registra `supabaseUrl is required`.
5. Si el error continúa solo en la sesión del usuario, reportarlo como diferencia de caché/sesión del navegador con evidencia, sin alterar el código.

## Límites y reporte

- Sin publicación ni despliegue.
- Sin cambios en Raiola.
- Sin cambios de base de datos, migraciones, esquema o datos.
- Archivos previstos a modificar: ninguno.
- El reporte final incluirá archivos tocados, publicación, base de datos, resultado del preview y errores restantes.
