/**
 * Reglas de la ciudad del cliente (alta nueva desde el vendedor).
 * El backend aplica la misma regla con un trigger BEFORE INSERT.
 */

export const MENSAJE_CIUDAD_REQUERIDA = "Ciudad requerida";

/** Recorta espacios y colapsa los internos. Devuelve "" si no hay contenido real. */
export function normalizarCiudad(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

/** Devuelve el mensaje de error si la ciudad no es válida para un alta nueva. */
export function validarCiudadAlta(valor: string | null | undefined): string | null {
  return normalizarCiudad(valor) ? null : MENSAJE_CIUDAD_REQUERIDA;
}