## Plan para arreglar la carga de foto de perfil

He revisado la pantalla de perfil, las políticas actuales del bucket `avatares`, y las solicitudes recientes. El problema más probable es que la subida no está llegando a completarse en almacenamiento: no aparecen requests al endpoint de archivos y el bucket no tiene objetos creados, por lo que la URL del avatar nunca se guarda.

### Qué voy a aplicar

1. Endurecer y simplificar la subida del avatar en `src/pages/Perfil.tsx`
   - Reemplazar el flujo actual por uno más robusto:
     - leer el archivo seleccionado
     - validar tipo y tamaño
     - subirlo a una ruta estable del usuario
     - verificar explícitamente el resultado de la subida
     - recién después guardar `avatar_url` en `profiles`
   - Añadir mensajes de error visibles y específicos en pantalla para distinguir:
     - error al elegir archivo
     - error al subir archivo
     - error al guardar perfil

2. Ajustar el manejo del input de archivo
   - Hacer que el selector funcione de forma consistente tanto desde el botón principal como desde el botón circular del avatar.
   - Resetear correctamente el input para permitir volver a seleccionar el mismo archivo.
   - Añadir trazas de diagnóstico seguras para identificar si el evento `onChange` se dispara o no.

3. Corregir y reforzar permisos del bucket
   - Crear una nueva migración SQL para recrear las políticas del bucket `avatares` de forma idempotente.
   - Mantener lectura pública y asegurar permisos de `INSERT`, `UPDATE` y `DELETE` sólo dentro de la carpeta del usuario autenticado.
   - Incluir `DROP POLICY IF EXISTS` antes de recrearlas para evitar estados inconsistentes entre entornos.

4. Mejorar la persistencia visual del avatar
   - Normalizar la URL pública guardada y aplicar cache-busting sólo en el render, no como valor base persistido si hace falta.
   - Añadir refresco posterior a la subida para confirmar que el perfil devuelve el avatar guardado.
   - Mantener fallback con iniciales si la imagen falla al cargar.

5. Corregir warnings de componentes UI relacionados
   - Actualizar `src/components/ui/badge.tsx` para usar `React.forwardRef`, porque hoy genera warnings de ref en `Perfil`.
   - Revisar el uso del botón/trigger del avatar para evitar efectos secundarios con Radix y refs en el árbol del perfil.

### Resultado esperado

- El usuario podrá seleccionar una imagen desde su ordenador.
- El archivo se guardará correctamente en el bucket de avatares.
- La URL se persistirá en el perfil.
- La nueva foto aparecerá inmediatamente en `Mi Perfil`.
- Si algo falla, el sistema mostrará exactamente en qué paso falló.

### Detalles técnicos

- Archivos a tocar:
  - `src/pages/Perfil.tsx`
  - `src/components/ui/badge.tsx`
  - nueva migración en `supabase/migrations/...sql`
- No voy a tocar `src/integrations/supabase/client.ts`.
- La corrección de base de datos será sólo de políticas y no cambiará datos existentes.

Si apruebas, lo implemento completo ahora.