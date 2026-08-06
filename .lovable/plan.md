# Asistente IA en el sidebar + globo de WhatsApp en Dashboard

Dos accesos de comunicación, claramente diferenciados, sin tocar rutas, permisos ni diseño existente.

## 1. Enlace "Asistente IA" en el sidebar

- Se añade como segunda opción del grupo **General** (debajo de Dashboard), visible para todos los perfiles, sin submenús.
- Icono `Bot` (lucide, ya usado en el proyecto) para diferenciarlo del `MessageCircle` del Chat interno.
- Es un `<a>` externo, no una ruta: `target="_blank"`, `rel="noopener noreferrer"`, hacia `https://asistente-westone-v1.lovable.app`. Nunca iframe.
- `aria-label="Abrir Asistente IA en una nueva pestaña"` + icono discreto de "enlace externo" al final cuando el sidebar está expandido.
- Sidebar colapsado: solo el icono, con tooltip accesible `Asistente IA` (prop `tooltip` de `SidebarMenuButton`, que ya usa Radix Tooltip).
- Realce sobrio: borde/fondo tenue con el amarillo de marca ya existente (tokens `brand`), manteniendo hover, focus visible y área táctil de 44px mínimo.

## 2. Globo flotante de WhatsApp (solo Dashboard)

- Nuevo componente flotante renderizado **únicamente** dentro de la página Dashboard, por lo que desaparece automáticamente al navegar a Clientes, Usuarios, Importación, Reportes o cualquier otra ruta.
- Botón circular fijo en la esquina inferior derecha, con sombra, verde WhatsApp sobrio, icono de WhatsApp, sin animaciones invasivas ni parpadeos.
- Enlace directo a `https://wa.me/59164280437?text=Hola%2C%20necesito%20asistencia%20con%20Westone.` con `target="_blank"` y `rel="noopener noreferrer"`. Sin modal, sin chat interno, sin Asistente IA.
- Tooltip `Contactar a Westone por WhatsApp`, `aria-label="Abrir WhatsApp de Westone"`, tamaño 56px (>44px), márgenes seguros en móvil (`safe-area` inferior) para no tapar contenido ni navegación.

## 3. Validación

- Revisión en desktop, tablet y móvil, sidebar expandido y colapsado.
- Navegación por teclado (Tab/Enter) y foco visible en ambos controles.
- Comprobación de que el globo aparece en `/app` y no en el resto de rutas, y de que no hay errores de consola ni enlaces roscos.

## Detalles técnicos

- `src/components/layout/AppSidebar.tsx`: se amplía el tipo `NavItem` con un campo opcional `external`, y `renderGroup` renderiza `<a>` en lugar de `NavLink` cuando el item es externo; se pasa `tooltip={item.title}` a `SidebarMenuButton` para el estado colapsado.
- Nuevo `src/components/WhatsAppFloatingButton.tsx` con el enlace y el tooltip; se monta en `src/pages/Dashboard.tsx` (no en `AppLayout`) para limitar el alcance al Dashboard.
- Sin cambios en rutas, `RequireAuth`, base de datos ni edge functions.
