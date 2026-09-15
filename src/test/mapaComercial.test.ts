import { describe, expect, it } from "vitest";
import {
  ZOOM_DETALLE,
  ZOOM_MAX,
  ZOOM_MIN,
  boundsDeClientes,
  colorIntensidad,
  coordenadaValida,
  normalizarIntensidad,
  puntosValidos,
  radioIntensidad,
} from "@/lib/mapaComercial";

describe("normalizarIntensidad", () => {
  it("no deja invisibles a los clientes menores cuando hay un valor extremo", () => {
    const valores = [100, 200, 300, 400, 500, 1_000_000];
    const f = normalizarIntensidad(valores);
    expect(f(1_000_000)).toBe(1);
    expect(f(100)).toBeGreaterThan(0.1);
    expect(f(500)).toBeGreaterThan(f(100));
  });

  it("devuelve 0 para ventas nulas o negativas y 0 si no hay datos", () => {
    const f = normalizarIntensidad([10, 20]);
    expect(f(0)).toBe(0);
    expect(f(-5)).toBe(0);
    expect(normalizarIntensidad([])(10)).toBe(0);
  });

  it("es monótona creciente", () => {
    const f = normalizarIntensidad([10, 50, 90, 130]);
    expect(f(10)).toBeLessThanOrEqual(f(50));
    expect(f(50)).toBeLessThanOrEqual(f(90));
  });
});

describe("helpers Leaflet del mapa comercial", () => {
  const laPaz = { latitud: -16.5, longitud: -68.15 };
  const santaCruz = { latitud: -17.78, longitud: -63.18 };
  const tarija = { latitud: -21.53, longitud: -64.73 };

  it("mantiene constantes de zoom válidas", () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_DETALLE);
    expect(ZOOM_DETALLE).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it("valida coordenadas utilizables", () => {
    expect(coordenadaValida(laPaz)).toBe(true);
    expect(coordenadaValida({ latitud: 0, longitud: 0 })).toBe(false);
    expect(coordenadaValida({ latitud: 91, longitud: -68.15 })).toBe(false);
    expect(coordenadaValida({ latitud: -16.5, longitud: 181 })).toBe(false);
    expect(coordenadaValida({ latitud: Number.NaN, longitud: -68.15 })).toBe(false);
  });

  it("filtra puntos sin coordenadas válidas", () => {
    const puntos = puntosValidos([
      laPaz,
      { latitud: 0, longitud: 0 },
      santaCruz,
      { latitud: 95, longitud: -63.18 },
    ]);

    expect(puntos).toEqual([laPaz, santaCruz]);
  });

  it("devuelve null si no hay puntos válidos", () => {
    expect(boundsDeClientes([])).toBeNull();
    expect(boundsDeClientes([{ latitud: 0, longitud: 0 }])).toBeNull();
  });

  it("calcula bounds que contienen clientes dispersos", () => {
    const bounds = boundsDeClientes([laPaz, santaCruz, tarija])!;

    expect(bounds[0][0]).toBeLessThanOrEqual(tarija.latitud);
    expect(bounds[1][0]).toBeGreaterThanOrEqual(laPaz.latitud);
    expect(bounds[0][1]).toBeLessThanOrEqual(laPaz.longitud);
    expect(bounds[1][1]).toBeGreaterThanOrEqual(santaCruz.longitud);
  });

  it("agrega margen cuando hay un único cliente", () => {
    const bounds = boundsDeClientes([laPaz])!;

    expect(bounds[0][0]).toBeLessThan(laPaz.latitud);
    expect(bounds[1][0]).toBeGreaterThan(laPaz.latitud);
    expect(bounds[0][1]).toBeLessThan(laPaz.longitud);
    expect(bounds[1][1]).toBeGreaterThan(laPaz.longitud);
  });

  it("calcula radio creciente según intensidad", () => {
    expect(radioIntensidad(0)).toBeLessThan(radioIntensidad(1));
  });

  it("genera color hsl con alpha configurable", () => {
    expect(colorIntensidad(0.5, 0.75)).toContain("hsl(");
    expect(colorIntensidad(0.5, 0.75)).toContain("/ 0.75");
  });
});
