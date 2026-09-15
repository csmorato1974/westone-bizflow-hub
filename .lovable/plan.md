# Reparación controlada del preview — restaurar `.env`

## Estado actual (verificado)

- `.env` ya existe y contiene las 3 variables del backend Lovable Cloud de este proyecto:
  `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  (procedencia verificada: coinciden con el proyecto vinculado).
- El preview ya carga sin el error "supabaseUrl is required" (verificado en navegador).
- Faltan dos variables: `VITE_APP_LOGIN_URL` y `VITE_SOPORTE_WHATSAPP`.
  - `VITE_APP_LOGIN_URL`: ningún archivo de `src/` la lee (la URL pública está fijada en `src/lib/appUrls.ts`); se añade por completitud.
  - `VITE_SOPORTE_WHATSAPP`: la lee `src/lib/onboarding.ts`; activa el botón de contacto directo por WhatsApp en la pantalla de acceso.

## Cambios (alcance único)

Solo se toca el archivo `.env` (raíz del proyecto):

1. Mantener intactas las 3 variables Supabase existentes (sin mostrar valores en la respuesta).
2. Añadir:
   - `VITE_APP_LOGIN_URL=https://westone.vinculovirtual.com/login`
   - `VITE_SOPORTE_WHATSAPP=59170000000`

Nada más. No se toca: `src/`, `supabase/`, `.gitignore`, base de datos, migraciones, Raiola. No se publica ni se despliega. El `.env` no se versiona (está excluido por `.gitignore`).

## Verificación

1. Reiniciar el servidor de preview para que Vite relea `.env`.
2. Esperar a que el build marque OK.
3. Abrir el preview en navegador de prueba y confirmar:
   - la pantalla inicial de WESTONE renderiza (botón "INICIAR SESIÓN"),
   - la consola no muestra "supabaseUrl is required" ni otros errores.

## Reporte final

- Archivos tocados: únicamente `.env`.
- Publicación: no. Base de datos: no tocada.
- Resultado del preview y errores restantes si los hay.
