/**
 * Lógica pura de la clave provisional estándar, aislada para poder probarla
 * sin levantar la función de servidor.
 */

export const PROVISIONAL_DOMAIN = "@clientes-temp.local";

/** Tamaños de tanda permitidos en el modo masivo reanudable. */
export const TANDA_MIN = 25;
export const TANDA_MAX = 50;
export const TANDA_DEFECTO = 25;

/** Presupuesto de tiempo por invocación: muy por debajo del límite de 150s. */
export const PRESUPUESTO_MS = 60_000;

/** Clave provisional (`Wst-{parte-local}-26`) o null si el email no es provisional. */
export function claveProvisional(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e.endsWith(PROVISIONAL_DOMAIN)) return null;
  const local = e.slice(0, e.length - PROVISIONAL_DOMAIN.length);
  if (!local) return null;
  return `Wst-${local}-26`;
}

/** Normaliza el tamaño de tanda recibido del cliente al rango permitido. */
export function normalizarTanda(n?: number): number {
  if (!n || Number.isNaN(n)) return TANDA_DEFECTO;
  return Math.min(TANDA_MAX, Math.max(TANDA_MIN, Math.floor(n)));
}
