import { describe, expect, it } from "vitest";
import {
  PRECISION_MAXIMA_METROS,
  formatearCoordenada,
  latitudValida,
  longitudValida,
  mensajeErrorGeo,
  precisionAceptable,
  precisionValida,
  validarCoordenadas,
} from "@/lib/gps";

describe("validación de coordenadas GPS", () => {
  it("acepta coordenadas dentro de rango", () => {
    expect(validarCoordenadas({ latitud: -17.7833, longitud: -63.1821, precisionMetros: 12 })).toBeNull();
    expect(latitudValida(90)).toBe(true);
    expect(longitudValida(-180)).toBe(true);
  });

  it("rechaza latitud fuera de rango", () => {
    expect(latitudValida(90.1)).toBe(false);
    expect(validarCoordenadas({ latitud: 91, longitud: 0 })).toMatch(/Latitud/);
  });

  it("rechaza longitud fuera de rango", () => {
    expect(longitudValida(180.5)).toBe(false);
    expect(validarCoordenadas({ latitud: 0, longitud: -181 })).toMatch(/Longitud/);
  });

  it("rechaza valores no numéricos o infinitos", () => {
    expect(latitudValida("10" as unknown)).toBe(false);
    expect(longitudValida(Number.NaN)).toBe(false);
    expect(validarCoordenadas({ latitud: Number.POSITIVE_INFINITY, longitud: 0 })).toMatch(/Latitud/);
  });

  it("exige precisión positiva cuando se envía", () => {
    expect(precisionValida(0)).toBe(false);
    expect(precisionValida(-5)).toBe(false);
    expect(precisionValida(null)).toBe(true);
    expect(validarCoordenadas({ latitud: 0, longitud: 0, precisionMetros: 0 })).toMatch(/[Pp]recisión/);
  });

  it("marca la precisión aceptable solo hasta el umbral", () => {
    expect(precisionAceptable(PRECISION_MAXIMA_METROS)).toBe(true);
    expect(precisionAceptable(PRECISION_MAXIMA_METROS + 1)).toBe(false);
    expect(precisionAceptable(null)).toBe(false);
  });

  it("formatea coordenadas con seis decimales", () => {
    expect(formatearCoordenada(-17.7833)).toBe("-17.783300");
    expect(formatearCoordenada(null)).toBe("—");
  });

  it("devuelve mensajes claros según el error del navegador", () => {
    expect(mensajeErrorGeo(1)).toMatch(/[Pp]ermiso/);
    expect(mensajeErrorGeo(2)).toMatch(/señal|ubicación/);
    expect(mensajeErrorGeo(3)).toMatch(/tardó/);
    expect(mensajeErrorGeo(99, "algo")).toBe("algo");
  });
});
