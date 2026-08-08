/** Utilidades de validación de coordenadas GPS (sin servicios externos). */

export const PRECISION_MAXIMA_METROS = 50;

export interface Coordenadas {
  latitud: number;
  longitud: number;
  precisionMetros?: number | null;
}

export function latitudValida(lat: unknown): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function longitudValida(lng: unknown): boolean {
  return typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function precisionValida(p: unknown): boolean {
  if (p === null || p === undefined) return true;
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}

/** Devuelve el mensaje de error o null si las coordenadas son válidas. */
export function validarCoordenadas({ latitud, longitud, precisionMetros }: Coordenadas): string | null {
  if (!latitudValida(latitud)) return "Latitud fuera de rango (-90 a 90)";
  if (!longitudValida(longitud)) return "Longitud fuera de rango (-180 a 180)";
  if (!precisionValida(precisionMetros)) return "La precisión debe ser mayor a cero";
  return null;
}

/** true cuando la precisión es suficiente para guardar sin advertencia. */
export function precisionAceptable(p?: number | null, maximo = PRECISION_MAXIMA_METROS): boolean {
  if (p === null || p === undefined) return false;
  return precisionValida(p) && p <= maximo;
}

export function formatearCoordenada(v?: number | null): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(6) : "—";
}

/** Mensaje claro para los errores del navegador. */
export function mensajeErrorGeo(code?: number, mensaje?: string): string {
  if (code === undefined && typeof navigator !== "undefined" && !navigator.geolocation) {
    return "Este navegador no ofrece geolocalización.";
  }
  switch (code) {
    case 1:
      return "Permiso de ubicación denegado. Habilitalo en los ajustes del navegador y volvé a intentar.";
    case 2:
      return "No se pudo obtener la señal GPS. Salí al exterior o activá la ubicación del dispositivo.";
    case 3:
      return "La búsqueda de ubicación tardó demasiado. Volvé a intentar.";
    default:
      return mensaje || "No se pudo obtener la ubicación.";
  }
}

/** La API de geolocalización requiere contexto seguro (HTTPS o localhost). */
export function contextoSeguro(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext === true;
}
