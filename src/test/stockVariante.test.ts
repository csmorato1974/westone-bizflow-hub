import { describe, it, expect } from "vitest";
import {
  stockFisico,
  stockReservado,
  stockDisponible,
  resumenStockVariante,
  resumenStockProducto,
} from "@/lib/stockVariante";

describe("stockVariante", () => {
  it("trata reservado null/undefined como 0", () => {
    expect(stockReservado({ cantidad: 10, reservado: null })).toBe(0);
    expect(stockReservado({ cantidad: 10 })).toBe(0);
    expect(stockDisponible({ cantidad: 10, reservado: null })).toBe(10);
  });

  it("trata cantidad null como 0", () => {
    expect(stockFisico({ cantidad: null })).toBe(0);
    expect(stockDisponible({ cantidad: null, reservado: 5 })).toBe(0);
  });

  it("disponible = max(cantidad - reservado, 0)", () => {
    expect(stockDisponible({ cantidad: 100, reservado: 30 })).toBe(70);
    expect(stockDisponible({ cantidad: 5, reservado: 9 })).toBe(0);
    expect(stockDisponible({ cantidad: 40, reservado: 40 })).toBe(0);
  });

  it("ignora valores no numéricos y negativos", () => {
    expect(stockFisico({ cantidad: NaN })).toBe(0);
    expect(stockReservado({ cantidad: 10, reservado: -3 })).toBe(0);
    expect(stockFisico({ cantidad: -8 })).toBe(0);
  });

  it("resume una variante", () => {
    expect(resumenStockVariante({ cantidad: 30, reservado: 12 })).toEqual({
      fisico: 30,
      reservado: 12,
      disponible: 18,
    });
  });

  it("suma totales por producto de forma coherente", () => {
    expect(
      resumenStockProducto([
        { cantidad: 100, reservado: 10 },
        { cantidad: 40, reservado: 50 },
        { cantidad: null, reservado: null },
      ]),
    ).toEqual({ fisico: 140, reservado: 60, disponible: 90 });
  });

  it("producto sin variantes da ceros", () => {
    expect(resumenStockProducto([])).toEqual({ fisico: 0, reservado: 0, disponible: 0 });
  });
});
