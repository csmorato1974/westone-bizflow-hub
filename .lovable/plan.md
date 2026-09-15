# Diagnóstico: preview en blanco (sin cambios aplicados)

Solo diagnóstico. No se editó código, configuración ni base de datos.

## Lo que se comprobó ahora mismo

1. El servidor del preview responde correctamente (código 200) y entrega la página de inicio.
2. Abrí la app en un navegador de prueba: **la pantalla de inicio se renderiza con contenido real** ("WESTONE", "INICIAR SESIÓN", los bloques de Vendedores / Catálogo / Logística).
3. En la consola del navegador de prueba **no aparece ningún error**, y en particular **no aparece "supabaseUrl is required"**. Solo hay dos avisos informativos de la librería de navegación, inofensivos.
4. Las tres variables de conexión del backend **están presentes** en el entorno del preview, y fueron reescritas por la plataforma hoy a las 15:43 (mismo minuto de tu mensaje).
5. La telemetría de tu propia sesión (errores de ejecución y consola) llegó **vacía**, así que el fallo no quedó registrado en el momento de escribirme.
6. La última compilación figura como correcta. Hay errores de verificación de tipos en una función de servidor (la de reaplicar claves provisionales), pero esa función no interviene en cargar la pantalla: no puede dejar el preview en blanco.

Conclusión de partida: **el preview funciona en el servidor**. Lo que ves en blanco es casi con seguridad algo del lado de tu navegador o de la ruta concreta que estás abriendo.

## Causas posibles, ordenadas por probabilidad

1. **Caché de la app instalable (PWA) en tu navegador.** La app registra un "service worker" que guarda el paquete de la aplicación. Si guardó una versión antigua —por ejemplo la de cuando faltaban las variables de conexión— te la sigue sirviendo aunque el servidor ya esté bien. Es la explicación que mejor encaja: servidor correcto + tu pantalla en blanco.
2. **Pantalla en blanco solo en rutas con sesión.** Las páginas internas están detrás de comprobación de sesión y de permisos. Si tu sesión guardada quedó a medias, puede quedarse en un estado sin nada visible en lugar de mandarte al login. La pantalla pública sí carga, lo que apunta a este escenario si lo que ves en blanco es una página interna.
3. **Variables reinyectadas mientras tenías el preview abierto.** El archivo de entorno se reescribe y el servidor se reinicia; una pestaña abierta durante ese reinicio puede quedar con el paquete a medio cargar y mostrarse vacía hasta recargar.
4. **Menos probable:** un fallo puntual de una página concreta. No hay ninguna evidencia de esto ahora mismo.

## ¿Faltan variables de entorno?

No. Las tres están presentes y completas en el preview. El archivo que las contiene está excluido del repositorio a propósito (es correcto: son datos de entorno, no código), por eso la compilación de GitHub Actions no lo usa y toma sus propios valores guardados como secretos.

## Por qué producción (Raiola) sí funciona y el preview no

- **Producción** es un paquete ya compilado: las variables quedaron incrustadas dentro del paquete en el momento de compilar, y se sirve desde otro dominio, con su propia caché y su propio service worker. Si ese paquete se compiló con los valores correctos, funciona siempre.
- **El preview** compila al vuelo y lee las variables del entorno del proyecto en cada arranque; se reinicia cuando ese entorno cambia, y se sirve desde el dominio de preview, con una caché distinta de la de producción.
- Es decir: **son dos instalaciones independientes con cachés independientes**. Que una funcione no dice nada de la otra, y limpiar una no limpia la otra.

## Pasos seguros de verificación (sin cambiar nada)

Todos son de comprobación; ninguno modifica el proyecto ni la base de datos.

1. Abre el preview y haz una **recarga forzada** (Ctrl+Shift+R en Windows, Cmd+Shift+R en Mac). Anota si sigue en blanco.
2. Si sigue en blanco: en el navegador, herramientas de desarrollo → Aplicación → Service Workers → "Unregister", y luego "Clear storage"; recarga. Esto solo borra la copia local en tu equipo.
3. Prueba en **ventana de incógnito** o en otro navegador. Si ahí carga bien, queda confirmado que era caché local y no el proyecto.
4. Dime **exactamente qué dirección** del preview se queda en blanco (la de inicio, el login, o una página interna ya con sesión). Eso distingue entre la causa 1 y la causa 2.
5. Si es una página interna: cierra sesión, vuelve a entrar y observa si la pantalla en blanco desaparece.
6. Copia el texto de la consola del navegador en el momento del fallo (herramientas de desarrollo → Consola). Con eso puedo señalar la causa exacta en lugar de trabajar por probabilidades.

## Qué haría después, si me lo autorizas

Nada de esto está hecho ni se hará sin tu permiso:

- Endurecer el service worker para que nunca pueda servir un paquete antiguo tras un cambio de entorno.
- Corregir los errores de tipos de la función de claves provisionales (no afecta al preview, pero conviene dejarlo limpio).
- Añadir una pantalla de error visible en lugar de una página en blanco cuando algo falle al arrancar.
