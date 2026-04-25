## Problema

En `src/pages/Chat.tsx` la columna de mensajes crece sin límite y termina ocultando la caja de entrada (`Textarea` + botón Enviar), especialmente en móvil (360×669). Causas:

1. El contenedor raíz usa `h-[calc(100vh-4rem)]`, una altura fija que asume un header de 4rem y no respeta el layout real de `AppLayout` en móvil → el panel se sale del viewport.
2. Los contenedores `flex` intermedios (grid de dos columnas, columna de mensajes) **no tienen `min-h-0`**, así que el `ScrollArea` no se contrae y empuja el input fuera de pantalla.
3. El `scrollRef` apunta al `Root` de Radix `ScrollArea` y no al viewport interno, por lo que `scrollTo({ top: scrollHeight })` no siempre baja al último mensaje.

## Cambios propuestos (un solo archivo: `src/pages/Chat.tsx`)

### 1. Contenedor raíz con altura flexible
Reemplazar `h-[calc(100vh-4rem)]` por una combinación que se adapte al área disponible del `AppLayout` y siempre deje visible la caja de entrada:

```tsx
<div className="flex h-[100dvh] max-h-[calc(100dvh-4rem)] flex-col md:h-[calc(100vh-4rem)]">
```

- `100dvh` (dynamic viewport height) evita que la barra del navegador móvil tape el input.
- En escritorio mantiene el comportamiento actual.

### 2. Añadir `min-h-0` en cada nivel flex/grid
Para que el `ScrollArea` de mensajes se contraiga correctamente:

- Grid principal: `grid flex-1 min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]`
- Columna de mensajes: `flex flex-col min-h-0`
- Wrapper del `ScrollArea` de mensajes: asegurar `flex-1 min-h-0`
- Input siempre visible: el `<div className="border-t p-3">` queda como `shrink-0` para que nunca se reduzca ni se oculte.

### 3. Caja de entrada siempre visible (sticky-safe)
Cambiar el contenedor del input a:
```tsx
<div className="shrink-0 border-t bg-background p-3">
```
Y reducir el `min-h` del `Textarea` en móvil (`min-h-[40px]`) para que no consuma demasiado.

### 4. Scroll automático al fondo confiable
- Crear un `bottomRef` (`<div ref={bottomRef} />`) al final de la lista de mensajes.
- Reemplazar los `scrollRef.current?.scrollTo(...)` por `bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })`.
- Disparar el scroll en un `useEffect([messages.length, activeId])`, además del momento del envío y de la recepción Realtime.

### 5. Lista lateral (conversaciones) en móvil
En móvil el grid es de una sola columna, y al abrir una conversación ambas pantallas conviven. Para evitar que la lista ocupe espacio cuando hay un chat activo en pantallas pequeñas:

- Lista: `className={cn("flex flex-col border-r bg-muted/20 min-h-0", activeId && "hidden md:flex")}`
- Panel de mensajes: `className={cn("flex flex-col min-h-0", !activeId && "hidden md:flex")}`
- Añadir un botón "← Volver" en el header del panel de mensajes visible solo en móvil (`md:hidden`) que haga `setActiveId(null)`.

Esto resuelve también el problema secundario en móvil de que la lista de conversaciones empuje al chat fuera de la pantalla.

## Resultado esperado

- La caja de mensaje queda **siempre fija en la parte inferior**, visible en cualquier viewport.
- El historial de mensajes hace **scroll interno** dentro de su `ScrollArea` y se posiciona automáticamente en el último mensaje.
- En móvil, el usuario ve la lista o el chat (no ambos compitiendo por espacio) y puede volver con un botón.
- No se modifica la lógica de Realtime, envío, permisos ni el esquema de base de datos.

## Archivos a modificar

- `src/pages/Chat.tsx` (único archivo)
