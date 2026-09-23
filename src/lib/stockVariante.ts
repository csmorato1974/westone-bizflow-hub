/**
 * Helpers puros de visibilidad de stock por variante.
 * No escriben nada: solo derivan lo que la pantalla muestra.
 */

export interface StockVarianteBase {
  cantidad: number | null | undefined;
  reservado?: number | null | undefined;
}

export interface ResumenStock {
  fisico: number;
  reservado: number;
  disponible: number;
}

const entero = (v: number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/** Stock físico (cantidad). Null/undefined/NaN => 0. */
export const stockFisico = (v: StockVarianteBase): number => Math.max(0, entero(v.cantidad));

/** Reservado. Null/undefined/NaN => 0. */
export const stockReservado = (v: StockVarianteBase): number => Math.max(0, entero(v.reservado));

/** Disponible = max(cantidad - reservado, 0). */
export const stockDisponible = (v: StockVarianteBase): number =>
  Math.max(stockFisico(v) - stockReservado(v), 0);

/** Resumen de una variante. */
export const resumenStockVariante = (v: StockVarianteBase): ResumenStock => ({
  fisico: stockFisico(v),
  reservado: stockReservado(v),
  disponible: stockDisponible(v),
});

/** Totales por producto (suma coherente de sus variantes). */
export const resumenStockProducto = (variantes: StockVarianteBase[]): ResumenStock =>
  (variantes ?? []).reduce<ResumenStock>(
    (acc, v) => {
      const r = resumenStockVariante(v);
      return {
        fisico: acc.fisico + r.fisico,
        reservado: acc.reservado + r.reservado,
        disponible: acc.disponible + r.disponible,
      };
    },
    { fisico: 0, reservado: 0, disponible: 0 },
  );
