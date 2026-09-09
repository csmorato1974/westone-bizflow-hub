/** Helpers puros del mapa comercial: proyección Mercator, encuadre automático e intensidad de heatmap. */

export const TILE = 256;
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 14;

export interface PuntoGeo {
  latitud: number;
  longitud: number;
}

/** Proyección Web Mercator a píxeles del mundo para un zoom dado. */
export const worldPoint = (lat: number, lon: number, zoom: number) => {
  const scale = TILE * 2 ** zoom;
  const safeLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

export interface Viewport {
  zoom: number;
  /** Píxel de mundo (al zoom calculado) que corresponde a la esquina superior izquierda del contenedor. */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Encuadre automático (fit bounds): calcula zoom y origen para que todos los puntos
 * entren en el contenedor, con margen y zoom acotado entre ZOOM_MIN y ZOOM_MAX.
 * Con un único punto usa un zoom de detalle (ZOOM_MAX - 3).
 */
export function calcularViewport(
  puntos: PuntoGeo[],
  width: number,
  height: number,
  padding = 32,
): Viewport | null {
  if (!puntos.length || width <= 0 || height <= 0) return null;

  const base = puntos.map((p) => worldPoint(p.latitud, p.longitud, 0));
  const minX = Math.min(...base.map((p) => p.x));
  const maxX = Math.max(...base.map((p) => p.x));
  const minY = Math.min(...base.map((p) => p.y));
  const maxY = Math.max(...base.map((p) => p.y));

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const utilW = Math.max(1, width - padding * 2);
  const utilH = Math.max(1, height - padding * 2);

  let zoom: number;
  if (spanX < 1e-9 && spanY < 1e-9) {
    zoom = ZOOM_MAX - 3;
  } else {
    const escala = Math.min(spanX > 0 ? utilW / spanX : Infinity, spanY > 0 ? utilH / spanY : Infinity);
    zoom = Math.log2(escala);
  }
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.floor(zoom * 100) / 100));

  const factor = 2 ** zoom;
  const centroX = ((minX + maxX) / 2) * factor;
  const centroY = ((minY + maxY) / 2) * factor;

  return { zoom, originX: centroX - width / 2, originY: centroY - height / 2, width, height };
}

/** Posición en píxeles dentro del contenedor para un punto dado. */
export const posicionEnViewport = (punto: PuntoGeo, vp: Viewport) => {
  const p = worldPoint(punto.latitud, punto.longitud, vp.zoom);
  return { left: p.x - vp.originX, top: p.y - vp.originY };
};

/** Tiles OSM necesarios para cubrir el viewport. */
export function tilesDeViewport(vp: Viewport) {
  const max = 2 ** vp.zoom;
  const x0 = Math.floor(vp.originX / TILE);
  const x1 = Math.floor((vp.originX + vp.width) / TILE);
  const y0 = Math.max(0, Math.floor(vp.originY / TILE));
  const y1 = Math.min(max - 1, Math.floor((vp.originY + vp.height) / TILE));
  const tiles: { x: number; y: number; left: number; top: number; key: string }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.push({
        x: ((x % max) + max) % max,
        y,
        left: x * TILE - vp.originX,
        top: y * TILE - vp.originY,
        key: `${x}-${y}`,
      });
    }
  }
  return tiles;
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

/** Color del heatmap: amarillo marca (baja venta) → rojo (alta venta). */
export const colorIntensidad = (i: number, alpha = 0.75) =>
  `hsl(${Math.round(48 - 48 * i)} 95% ${Math.round(55 - 8 * i)}% / ${alpha})`;