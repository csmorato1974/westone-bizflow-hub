
# Westone Performance Ecosystem — MVP

App web/PWA B2B segura para gestión de fuerza de ventas, clientes, pedidos, catálogo y logística, con identidad visual Westone (negro industrial + amarillo dorado #FFCC00, tipografía fuerte, look automotriz/heavy-duty).

## Identidad de marca aplicada
- **Colores**: negro profundo, amarillo Westone dorado, acentos blancos y grises industriales.
- **Logo Westone** (montaña + tipografía) en login, sidebar y portal de cliente, extraído del PDF.
- **Estilo**: cards con bordes definidos, tipografía bold tipo industrial, fondos oscuros en paneles internos, mobile-first.
- **PWA**: instalable en celular (manifest + meta tags + ícono Westone).

## Backend (Lovable Cloud)
Auth + Postgres con RLS estricta. Tabla `user_roles` separada con enum `app_role` (`super_admin`, `admin`, `vendedor`, `logistica`, `cliente`) y función `has_role()` SECURITY DEFINER. Tabla `audit_logs` para acciones sensibles.

**Tablas principales**: `profiles`, `user_roles`, `clientes` (empresa, contacto, celular, dirección, lat/lng, vendedor_id), `productos` (línea, descripción, ficha técnica, presentaciones), `listas_precios`, `lista_precio_items`, `cliente_lista_precio`, `stock`, `pedidos` (estado: borrador → enviado → aprobado → listo_despacho → en_ruta → entregado → cancelado), `pedido_items`, `audit_logs`, `notificaciones`.

**RLS por rol**:
- Vendedor: ve/edita solo sus clientes y pedidos.
- Cliente: ve solo su perfil, su lista de precios autorizada y sus pedidos.
- Logística: ve pedidos en estado `listo_despacho`/`en_ruta`.
- Admin / super_admin: acceso total.

## Módulos del MVP

### 1. Autenticación y seguridad
- Login email/password obligatorio, signup solo por invitación admin.
- Rutas protegidas por rol (`<RequireRole>` wrapper).
- Logout, recuperación de contraseña, sesión persistente.
- Auditoría: cada acción crítica (crear cliente, crear pedido, cambio de estado, cambio de rol) escribe en `audit_logs`.

### 2. Panel del Vendedor
- Dashboard con sus KPIs (clientes, pedidos del mes, pendientes).
- Registro de cliente: empresa, contacto, celular, dirección, **botón "Capturar GPS"** que usa `navigator.geolocation`.
- Asignación de lista de precios al crear cliente.
- Al crear cliente → genera link `wa.me` con mensaje de bienvenida prellenado para enviar manualmente.
- Crear pedidos a nombre de sus clientes desde el catálogo autorizado de ese cliente.

### 3. Portal del Cliente
- Vista limpia con logo Westone.
- Catálogo filtrado por su lista de precios (solo ve productos y precios autorizados).
- Ficha de producto: descripción, datos técnicos (punto congelamiento/ebullición, presentación), imagen, stock disponible.
- Carrito → generar pedido. Ve historial y estado en tiempo real.

### 4. Módulo de Pedidos
- Estados con badges de color.
- Vendedor/admin recibe notificación in-app cuando cliente genera pedido.
- Admin aprueba → estado pasa a `listo_despacho` → notificación a logística.
- Cada notificación genera un link `wa.me` clickeable con resumen del pedido.

### 5. Panel de Logística
- Solo ve pedidos `listo_despacho` y `en_ruta`.
- Tarjeta de pedido con: cliente, dirección, contacto, celular (botón llamar / WhatsApp), **botón "Abrir en Maps"** con coordenadas GPS, lista de items.
- Acciones: marcar `en_ruta`, marcar `entregado`.

### 6. Panel Administrativo
- Gestión de usuarios y asignación de roles.
- Gestión de vendedores (asignar clientes).
- CRUD de clientes (vista global).
- CRUD de productos y fichas técnicas.
- CRUD de listas de precios y asignación a clientes.
- Gestión de stock (ajustes manuales con motivo, queda en auditoría).
- Vista global de pedidos con filtros.
- Configuración WhatsApp: plantillas de mensaje (bienvenida, nuevo pedido, listo despacho).
- Visor de logs de auditoría con filtros (usuario, acción, fecha).

### 7. WhatsApp (vía links wa.me)
- No hay API ni costos. Cada notificación importante muestra un botón "Enviar por WhatsApp" que abre WhatsApp Web/App con el mensaje prellenado al número correcto.
- Plantillas configurables desde admin (con variables `{cliente}`, `{pedido}`, `{direccion}`, etc.).

## Catálogo precargado
Los productos del PDF se cargan como seed con sus fichas técnicas:
- **Refrigerantes ligeros**: Supercoolant Red, Supercoolant Green, Ultra Antifreeze (Blue/Pink), Racing.
- **Anticongelantes ligeros**: Antifreeze Green, Antifreeze Red.
- **Heavy Duty**: Antifreeze Green HD, Antifreeze Red 50/50 HD, Supercoolant HD.
- **Western Blue DEF** (Diesel Exhaust Fluid).
- **Limpieza**: Clear-X (limpiaparabrisas), Car-X (shampoo), Radiator-X.

Cada producto con: descripción, punto de congelamiento, ebullición, presentaciones, recomendaciones de uso, imagen placeholder.

## Diseño
- Mobile-first, sidebar colapsable con íconos en desktop, drawer en móvil.
- Header oscuro con logo Westone amarillo, badge del rol activo.
- Cards con borde sutil amarillo en hover, botones primarios negros con texto amarillo, secundarios amarillos con texto negro.
- Tipografía bold y mayúsculas en títulos (estilo industrial del PDF).

## Lo que queda preparado para fase 2
- Cifrado de datos sensibles a nivel app (campos celular/dirección listos para `pgsodium`).
- Migración futura a WhatsApp Business API real (estructura de plantillas y notificaciones ya está).
- Reportes y métricas avanzadas.
- App nativa con Capacitor.
