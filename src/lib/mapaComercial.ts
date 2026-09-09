/** Helpers puros del mapa comercial: encuadre de clientes e intensidad de heatmap. */

export const ZOOM_MIN = 3;
export const ZOOM_MAX = 16;
/** Zoom de detalle cuando hay un único cliente (o todos en el mismo punto). */
export const ZOOM_DETALLE = 13;

export interface PuntoGeo {
  latitud: number;
  longitud: number;
}

export type LatLngBounds = [[number, number], [number, number]];

/** ¿La coordenada es utilizable en el mapa? */
export const coordenadaValida = (p: Partial<PuntoGeo>) =>
  Number.isFinite(p.latitud) && Number.isFinite(p.longitud) &&
  Math.abs(p.latitud as number) <= 90 && Math.abs(p.longitud as number) <= 180 &&
  !((p.latitud as number) === 0 && (p.longitud as number) === 0);

/** Filtra los puntos con coordenadas válidas. */
export const puntosValidos = <T extends PuntoGeo>(puntos: T[]) => puntos.filter(coordenadaValida);

/**
 * Bounds [[sur, oeste], [norte, este]] que contienen a todos los puntos.
 * Con un único punto (o puntos coincidentes) agrega un margen mínimo
 * para que Leaflet no aplique un zoom excesivo.
 */
export function boundsDeClientes(puntos: PuntoGeo[], margenMinimo = 0.02): LatLngBounds | null {
  const validos = puntosValidos(puntos);
  if (!validos.length) return null;

  let sur = Infinity, norte = -Infinity, oeste = Infinity, este = -Infinity;
  for (const p of validos) {
    sur = Math.min(sur, p.latitud);
    norte = Math.max(norte, p.latitud);
    oeste = Math.min(oeste, p.longitud);
    este = Math.max(este, p.longitud);
  }

  if (norte - sur < margenMinimo) { const c = (norte + sur) / 2; sur = c - margenMinimo / 2; norte = c + margenMinimo / 2; }
  if (este - oeste < margenMinimo) { const c = (este + oeste) / 2; oeste = c - margenMinimo / 2; este = c + margenMinimo / 2; }

  return [[sur, oeste], [norte, este]];
}

/**
 * Normalización robusta de intensidad para el heatmap de ventas.
 * Se recorta (clamp) en el percentil 90 para que un cliente extremo no aplaste al resto
 * y se aplica raíz cuadrada para dar visibilidad a los valores bajos. Devuelve 0..1.
 */
export function normalizarIntensidad(valores: number[], percentil = 0.9) {
  const positivos = valores.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!positivos.length) return () => 0;
  const idx = Math.min(positivos.length - 1, Math.floor((positivos.length - 1) * percentil));
  const tope = positivos[idx] || positivos[positivos.length - 1];
  return (valor: number) => {
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    const ratio = Math.min(1, valor / tope);
    return Math.min(1, Math.max(0.12, Math.sqrt(ratio)));
  };
}

/** Radio en píxeles del círculo de calor según intensidad 0..1. */
export const radioIntensidad = (i: number) => 14 + i * 34;

/** Color del heatmap: amarillo marca (baja venta) → rojo (alta venta). */
export const colorIntensidad = (i: number, alpha = 0.75) =>
  `hsl(${Math.round(48 - 48 * i)} 95% ${Math.round(55 - 8 * i)}% / ${alpha})`;