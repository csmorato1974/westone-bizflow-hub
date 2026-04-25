## Diagnóstico

No existe ningún límite de 4 mensajes en el código ni en la base de datos. El problema está en cómo el chat maneja la **suscripción Realtime y el estado del input**:

1. **Canal Realtime con nombre fijo + re-suscripción constante**: El `useEffect` de Realtime depende de `[user?.id, activeId]`, así que cada vez que cambia la conversación activa se desuscribe y crea un nuevo canal con el mismo nombre `"chat-messages"`. Tras varios eventos el canal queda colgado en estado "joining" y deja de entregar nuevos mensajes.
2. **Closure obsoleto de `activeId`**: el handler de Realtime captura `activeId` por closure, así que mensajes nuevos pueden compararse contra un valor desactualizado y terminar contados como "no leídos" en lugar de añadirse al hilo.
3. **`send()` no actualiza el estado local**: confía 100% en que Realtime devuelva el INSERT propio. Si el canal está roto (causa #1), el mensaje se inserta en la BD pero nunca aparece en pantalla → da la falsa impresión de que "no deja enviar".
4. **Re-renders en cascada**: en los logs se ven 8+ recargas seguidas de `user_roles`/`profiles` tras el cuarto mensaje, lo que confirma un bucle que también puede congelar el textarea.

Verificado en BD: la conversación tiene exactamente 4 mensajes guardados; los siguientes intentos fallan silenciosamente por las causas anteriores.

## Cambios a realizar

**`src/pages/Chat.tsx`**

1. **Estabilizar el canal Realtime**:
   - Usar un nombre de canal **único por conversación** (ej. `chat-${activeId}`) o por usuario, en lugar del nombre fijo.
   - Mover `activeId` a un `useRef` que el handler de Realtime lea siempre actualizado, y dejar el `useEffect` dependiendo solo de `user?.id` para que **no se re-suscriba** al cambiar de conversación.
   - Asegurar `removeChannel` correcto en el cleanup.

2. **Hacer `send()` optimista y robusto**:
   - Insertar con `.select().single()` para recibir la fila creada y añadirla inmediatamente al estado local (evita depender de Realtime para ver el propio mensaje).
   - Deduplicar en el handler de Realtime (si el id ya existe en `messages`, no añadirlo otra vez).
   - Mostrar el `toast.error` con el mensaje real de Supabase si falla el insert, para que cualquier futuro fallo de RLS sea visible.

3. **Evitar el bucle de recargas**:
   - Quitar la llamada a `loadConversations()` desde el handler Realtime de `conversation_participants` y reemplazarla por una recarga puntual sólo cuando realmente cambia la membresía del usuario (con un debounce simple o comprobando que el evento sea relevante).
   - Memoizar `senderInfo` y evitar que el cambio de `messages` dispare recargas de perfiles/roles.

4. **Mejoras menores de UX**:
   - Hacer scroll al fondo cuando llega un mensaje propio recién insertado de forma optimista.
   - Limpiar el textarea **antes** del `await insert` (envío percibido instantáneo) y restaurar el texto si el insert falla.

## Resultado esperado

- Se pueden enviar mensajes sin límite alguno.
- Los mensajes propios aparecen al instante aunque Realtime tenga un hipo.
- Los mensajes de otros llegan en tiempo real sin necesidad de recargar.
- Desaparece el bucle de peticiones repetidas a `user_roles` / `profiles`.

No requiere cambios en la base de datos ni en RLS.