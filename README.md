# WESTONE APP

Aplicación comercial de Westone Performance para gestionar clientes, catálogo,
listas de precios, stock, pedidos, logística y comunicaciones comerciales.

## Tecnología

- React, TypeScript y Vite
- Tailwind CSS y componentes shadcn/ui
- Supabase para autenticación, datos, tiempo real y funciones de servidor
- Vitest para pruebas unitarias

## Configuración local

1. Copiá `.env.example` a `.env`.
2. Completá las variables de Supabase con las credenciales publicables del proyecto.
3. Instalá dependencias con `npm install`.
4. Iniciá la aplicación con `npm run dev`.

No uses ni expongas una clave `service_role` en el navegador.

## Comandos

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Estructura principal

- `src/pages`: pantallas por rol
- `src/components`: interfaz reutilizable
- `src/lib`: lógica comercial y utilidades
- `supabase/migrations`: historial de esquema y seguridad
- `supabase/functions`: funciones de servidor

## Variables de entorno

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_APP_LOGIN_URL` (opcional; por defecto usa el dominio actual con `/login`)
- `VITE_SOPORTE_WHATSAPP` (opcional)
