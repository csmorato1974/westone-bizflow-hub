# Diagnóstico: `supabaseUrl is required` en el preview (sin cambios)

## Evidencia verificada en esta sesión (solo lectura)

1. `/dev-server/.env` **existe** (350 bytes, modificado hoy 06:29 UTC) y contiene las tres variables: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (valores presentes, no mostrados).
2. El log de Vite muestra: `.env changed, restarting server...` a las 06:29:23 — el binding de Lovable Cloud **sí escribió el .env y reinició el servidor**.
3. Inmediatamente después del reinicio aparecen errores de pre-transform: `Failed to load url /node_modules/.vite/deps/@tanstack_react-query.js` y `react-router-dom.js` — **caché de dependencias optimizadas de Vite obsoleta** tras el reinicio.
4. `build-errors.log`: último build **OK** (el error de type-check de Deno es de una edge function, no afecta al preview).
5. `runtime-errors.log` y `console-logs.log`: **sin entradas actuales** — el error `supabaseUrl is required` no se está reproduciendo ahora mismo en la telemetría.

## 1) Mecanismo esperado de inyección Cloud ↔ preview

- Al conectar Lovable Cloud, la plataforma escribe automáticamente `.env` en la raíz del proyecto con `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_PROJECT_ID`.
- Vite lee ese `.env` al arrancar y reemplaza `import.meta.env.VITE_*` en el bundle en tiempo de build/servido.
- `src/integrations/supabase/client.ts` (auto-generado, no editable) consume esas variables. Nunca deben hardcodearse en el código.

## 2) Por qué podrían estar ausentes

Las variables **no están ausentes** (ver evidencia). La causa probable del error visto es de **timing/estado transitorio**:

- El `.env` fue (re)escrito hoy a las 06:29; Vite se reinició, pero la caché de dependencias pre-empaquetadas (`node_modules/.vite/deps`) quedó obsoleta, produciendo errores de pre-transform y potencialmente un módulo servido a medias donde `import.meta.env.VITE_SUPABASE_URL` llegó `undefined` al navegador.
- Escenario típico: el usuario abrió/recargó el preview en la ventana entre el reinicio del servidor y la re-optimización de dependencias, o el navegador sirvió un chunk cacheado del Service Worker (`public/sw.js`, registrado en `main.tsx`) construido antes de que existiera el `.env`.
- Este proyecto es una app PWA con service worker propio: un SW con caché agresiva puede servir un bundle viejo sin las variables incluso cuando el servidor ya las tiene.

## 3) Pasos mínimos recomendados para restaurar el binding (sin hardcodear)

En orden, deteniéndose en cuanto el preview funcione:

1. **Recarga forzada del preview** (Ctrl/Cmd+Shift+R) para descartar un chunk cacheado.
2. Si persiste: **limpiar el Service Worker** del preview (DevTools → Application → Service Workers → Unregister, y Clear storage) y recargar.
3. Si persiste: **reiniciar el dev server** (kill del proceso `vite`; el supervisor lo respawnea) para que relea `.env` y re-optimice deps. Opcionalmente borrar `node_modules/.vite` para forzar re-optimización.
4. Si aún persiste: en Lovable, **re-conectar/verificar la conexión de Lovable Cloud** (Settings → Cloud) para que re-escriba el `.env`, y volver al paso 3.
5. Para el **sitio publicado**: republicar (publish) — el build de publicación lee el `.env` en ese momento; si se publicó en una ventana sin `.env`, hay que republicar.

Nada de esto toca `client.ts` ni introduce credenciales en el código.

## 4) ¿Se puede resolver sin tocar `client.ts`?

**Sí.** `client.ts` está bien tal cual; el problema es de entorno/caché, no de código. Los pasos 1-3 (navegador/SW/reinicio de Vite) son enteramente operativos.

## 5) Evidencia a verificar antes de cualquier cambio

- `/tmp/observability/runtime-errors.log` tras una recarga fresca: ¿sigue apareciendo `supabaseUrl is required`?
- En el navegador (Playwright): `await page.evaluate(() => import.meta.env.VITE_SUPABASE_URL)` no es accesible directo, pero sí verificar si la app renderiza y si la consola repite el error tras unregister del SW.
- Confirmar que el SW (`public/sw.js`) no está sirviendo un bundle viejo: comparar el hash del chunk servido con el del build actual.
- Timestamp de `.env` vs. último arranque de Vite: si `.env` es más nuevo que el arranque, el servidor necesita reinicio.
- Estado de la conexión Cloud en Settings (que el proyecto siga vinculado a su backend).

## Conclusión del diagnóstico

El binding Cloud ↔ preview **existe y está escrito** (`.env` presente y completo). El error `supabaseUrl is required` fue con alta probabilidad un artefacto transitorio del reinicio de Vite con caché de deps obsoleta y/o del Service Worker de la PWA sirviendo un bundle anterior. La telemetría actual no muestra el error. No se requiere ningún cambio de código; solo pasos operativos (recarga dura → unregister SW → reinicio de Vite) si el error reaparece.
