# Diagnóstico del preview en blanco — evidencia recogida, sin cambios

## Hallazgo principal

El archivo `index-C4CTIVI1.js` que aparece en tu consola **no existe hoy en ninguno de los tres sitios**:

| Origen | Paquete que sirve ahora | ¿Contiene la dirección del backend? |
| --- | --- | --- |
| Preview de Lovable (interno, localhost) | `/src/main.tsx` (sin nombre con código) | Sí, variables presentes |
| Sitio publicado en Lovable | `index-DWog-5iS.js` | Sí |
| Raiola (westone.vinculovirtual.com) | `index-D2qGJ2WS.js` | Sí |
| Paquete compilado local | `index-CMIeSDdf.js` | Sí |

Al pedir `index-C4CTIVI1.js` a Raiola responde con la página HTML de inicio (no existe el archivo); en el sitio publicado responde 404.

Conclusión: el paquete que ejecuta tu navegador es una **copia antigua guardada por el modo instalable (PWA)** de una compilación previa hecha sin la variable. Ningún servidor lo sirve hoy.

## Respuestas a los puntos pedidos

1. **¿El proceso del preview lee el archivo de entorno?** Sí. Las tres variables están presentes y el preview arranca con ellas.
2. **¿El paquete público contiene la dirección del backend?** Sí, en los tres paquetes vivos aparece completa. El único que no la tiene es el que ya no existe (`C4CTIVI1`), servido desde la caché de tu navegador.
3. **¿El preview que pruebo es el mismo de la dirección pública?** Es el mismo proyecto y el mismo contenido, pero esa dirección pública exige inicio de sesión de Lovable: desde fuera responde "Unauthorized" (401). Además el preview nunca sirve archivos con nombre tipo `index-XXXX.js`, así que tu error viene de un sitio compilado, no del preview.
4. **Diferencia interno vs. externo:** ninguna en el código. La diferencia es de acceso (401 sin sesión) y de caché del navegador.
5. **Acción segura sin commit ni publicación:** reiniciar el servidor de preview y limpiar su caché de dependencias. No modifica archivos, ni base de datos, ni publica.

## Verificación propuesta (sin cambios)

1. Reiniciar el servidor de preview y esperar a que responda.
2. Abrir el preview en un navegador limpio, eliminar el modo instalable y el almacenamiento de ese dominio, y recargar.
3. Confirmar que la pantalla WESTONE carga y que la consola no registra el error.
4. Reportar: archivos tocados (ninguno), publicación (no), base de datos (no tocada).

## Lo que necesitas hacer en tu navegador

Como la copia antigua vive en tu equipo, hay que retirarla ahí: abrir el sitio, entrar en las herramientas del navegador, quitar el registro del modo instalable ("Service Workers" → Unregister), borrar el almacenamiento del sitio y recargar. En una ventana de incógnito debería cargar bien de inmediato: eso confirma el diagnóstico.

## Límites

Sin publicar, sin desplegar, sin tocar Raiola, sin base de datos, sin migraciones, sin editar `src/`, `supabase/`, `.env` ni `.gitignore`. Archivos previstos a modificar: ninguno.
