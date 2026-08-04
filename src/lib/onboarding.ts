/**
 * Onboarding de clientes con clave provisional.
 *
 * El envío NUNCA lo hace el servidor: la app solo prepara el contenido y abre
 * WhatsApp (wa.me) o el cliente de correo (mailto:) del administrador, que
 * revisa y presiona enviar manualmente.
 */

import { PROVISIONAL_DOMAIN } from "@/lib/clienteEstado";

/**
 * URL de acceso usada en todas las plantillas.
 * Centralizada: cambiar acá (o definir VITE_APP_LOGIN_URL) para apuntar a un
 * dominio propio en el futuro, sin tocar los textos.
 */
export const APP_LOGIN_URL: string =
  (import.meta.env.VITE_APP_LOGIN_URL as string | undefined)?.trim() ||
  "https://westone-bizflow-hub.lovable.app/login";

/**
 * Clave provisional de las cuentas importadas: `Wst-{parte-local-email}-26`
 * (ej. juan.perez@clientes-temp.local -> Wst-juan.perez-26).
 * Devuelve null si el email no es un placeholder provisional.
 */
export function claveProvisional(email?: string | null): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e.endsWith(PROVISIONAL_DOMAIN)) return null;
  const local = e.slice(0, e.length - PROVISIONAL_DOMAIN.length);
  if (!local) return null;
  return `Wst-${local}-26`;
}

export interface OnboardingVars {
  nombre_contacto: string;
  empresa: string;
  username: string;
  clave_provisional: string;
  url_login: string;
}

export function buildVars(input: {
  contacto?: string | null;
  empresa?: string | null;
  username?: string | null;
  emailAcceso?: string | null;
  emailCrm?: string | null;
}): OnboardingVars | null {
  const clave = claveProvisional(input.emailAcceso) ?? claveProvisional(input.emailCrm);
  if (!clave) return null;
  return {
    nombre_contacto: (input.contacto || input.empresa || "").trim(),
    empresa: (input.empresa || "").trim(),
    username: (input.username || "").trim(),
    clave_provisional: clave,
    url_login: APP_LOGIN_URL,
  };
}

export function mensajeWhatsapp(v: OnboardingVars): string {
  return `Hola ${v.nombre_contacto} 👋

Le escribimos de Westone Performance para informarle que ya puede acceder a nuestra nueva plataforma de pedidos online.

🔑 Sus credenciales de acceso:

Usuario: ${v.username}

Contraseña provisional: ${v.clave_provisional}

🌐 Ingrese aquí: ${v.url_login}

Al ingresar por primera vez, el sistema le pedirá crear una nueva contraseña personal. Es un paso único y rápido.

Ante cualquier duda, quedamos atentos.

Equipo Westone Performance`;
}

export const ASUNTO_EMAIL = "Acceso a tu cuenta en Westone Performance – Portal de Clientes";

export function cuerpoEmail(v: OnboardingVars): string {
  return `Hola ${v.nombre_contacto},

Nos complace informarte que ${v.empresa} ya tiene acceso habilitado a nuestro nuevo portal de pedidos online, donde podrás:

- Consultar catálogo y precios asignados

- Realizar y dar seguimiento a tus pedidos

- Ver tu historial de compras

CREDENCIALES DE ACCESO

Usuario: ${v.username}

Contraseña provisional: ${v.clave_provisional}

Ingresa aquí: ${v.url_login}

Nota: al iniciar sesión por primera vez, el sistema te solicitará crear una contraseña nueva y personal. Este paso es obligatorio y solo se realiza una vez.

Si tienes alguna duda, no dudes en contactarnos.

Saludos cordiales,

Equipo Westone Performance`;
}

export function mailtoLink(to: string, v: OnboardingVars): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    ASUNTO_EMAIL,
  )}&body=${encodeURIComponent(cuerpoEmail(v))}`;
}

/** Email real (no placeholder) al que se puede escribir. */
export function emailContactable(...candidatos: (string | null | undefined)[]): string | null {
  for (const c of candidatos) {
    const e = (c ?? "").trim().toLowerCase();
    if (e && e.includes("@") && !e.endsWith(PROVISIONAL_DOMAIN)) return e;
  }
  return null;
}

export const fechaEnvio = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
