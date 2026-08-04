# Catálogo del cliente con estilo "lista tipo admin"

Objetivo: que `/app/catalogo` se vea como la lista de Productos del administrador — filas compactas con miniatura de imagen a la izquierda, datos al centro y acciones a la derecha — manteniendo intactas todas las funciones de compra.

## Cambios visuales

- Reemplazar las tarjetas verticales (imagen cuadrada grande arriba) por filas compactas:
  - Miniatura cuadrada de 64–80 px a la izquierda, con borde y esquinas redondeadas; ícono de imagen cuando el producto no tiene foto.
  - Al centro: nombre del producto, línea `SKU · Línea`, badge de stock/agotado y selector de presentación.
  - A la derecha: precio en grande, botón de info y botón de agregar al carrito.
- Grid de filas: 1 columna en móvil, 2 columnas en pantallas grandes (igual que el listado admin), con el mismo espaciado compacto.
- Tocar la miniatura o el botón de info sigue abriendo el detalle del producto.
- El carrito lateral, los filtros por línea, el buscador y el diálogo de detalle se mantienen sin cambios.

## Detalles técnicos

- Único archivo a editar: `src/pages/cliente/Catalogo.tsx` (solo la parte de render de la lista de productos).
- Se conservan `productImageUrl`, `getCurrentVariante`, `add`, realtime de stock y validación pre-checkout.
- Solo tokens semánticos del design system (`muted`, `brand`, `success`, `destructive`); sin colores hardcodeados.
- Sin cambios en base de datos, consultas ni lógica de negocio.
