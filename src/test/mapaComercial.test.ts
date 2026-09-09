import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, calcularViewport, normalizarIntensidad, posicionEnViewport, tilesDeViewport } from "@/lib/mapaComercial";

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

describe("calcularViewport", () => {
  const laPaz = { latitud: -16.5, longitud: -68.15 };
  const santaCruz = { latitud: -17.78, longitud: -63.18 };

  it("devuelve null sin puntos", () => {
    expect(calcularViewport([], 400, 288)).toBeNull();
  });

  it("encuadra clientes dispersos dentro del contenedor", () => {
    const vp = calcularViewport([laPaz, santaCruz, { latitud: -21.53, longitud: -64.73 }], 400, 288)!;
    expect(vp.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(vp.zoom).toBeLessThanOrEqual(ZOOM_MAX);
    for (const p of [laPaz, santaCruz]) {
      const { left, top } = posicionEnViewport(p, vp);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(400);
      expect(top).toBeGreaterThan(0);
      expect(top).toBeLessThan(288);
    }
  });

  it("con un único cliente usa zoom de detalle y lo centra", () => {
    const vp = calcularViewport([laPaz], 400, 288)!;
    expect(vp.zoom).toBe(ZOOM_MAX - 3);
    const { left, top } = posicionEnViewport(laPaz, vp);
    expect(left).toBeCloseTo(200, 5);
    expect(top).toBeCloseTo(144, 5);
  });

  it("genera tiles que cubren todo el contenedor", () => {
    const vp = calcularViewport([laPaz, santaCruz], 400, 288)!;
    const tiles = tilesDeViewport(vp);
    expect(tiles.length).toBeGreaterThan(0);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + 256))).toBeGreaterThanOrEqual(400);
  });
});