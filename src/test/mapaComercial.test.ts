import { describe, expect, it } from "vitest";
import { boundsDeClientes, coordenadaValida, normalizarIntensidad, puntosValidos, radioIntensidad } from "@/lib/mapaComercial";

describe("normalizarIntensidad", () => {
  it("no deja invisibles a los clientes menores cuando hay un valor extremo", () => {
    const f = normalizarIntensidad([100, 200, 300, 400, 500, 1_000_000]);
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

  it("el radio crece con la intensidad", () => {
    expect(radioIntensidad(1)).toBeGreaterThan(radioIntensidad(0.2));
  });
});

describe("coordenadas", () => {
  it("descarta coordenadas ausentes, fuera de rango y (0,0)", () => {
    expect(coordenadaValida({ latitud: -16.5, longitud: -68.15 })).toBe(true);
    expect(coordenadaValida({ latitud: 0, longitud: 0 })).toBe(false);
    expect(coordenadaValida({ latitud: 120, longitud: 10 })).toBe(false);
    expect(coordenadaValida({ latitud: NaN, longitud: 10 })).toBe(false);
    expect(puntosValidos([{ latitud: 0, longitud: 0 }, { latitud: -17.78, longitud: -63.18 }])).toHaveLength(1);
  });
});

describe("boundsDeClientes", () => {
  const laPaz = { latitud: -16.5, longitud: -68.15 };
  const santaCruz = { latitud: -17.78, longitud: -63.18 };

  it("devuelve null sin puntos válidos", () => {
    expect(boundsDeClientes([])).toBeNull();
    expect(boundsDeClientes([{ latitud: 0, longitud: 0 }])).toBeNull();
  });

  it("encierra a todos los clientes", () => {
    const b = boundsDeClientes([laPaz, santaCruz, { latitud: -21.53, longitud: -64.73 }])!;
    const [[sur, oeste], [norte, este]] = b;
    expect(sur).toBeCloseTo(-21.53, 5);
    expect(norte).toBeCloseTo(-16.5, 5);
    expect(oeste).toBeCloseTo(-68.15, 5);
    expect(este).toBeCloseTo(-63.18, 5);
  });

  it("con un único cliente agrega margen mínimo alrededor", () => {
    const [[sur, oeste], [norte, este]] = boundsDeClientes([laPaz])!;
    expect(norte - sur).toBeCloseTo(0.02, 6);
    expect(este - oeste).toBeCloseTo(0.02, 6);
    expect((norte + sur) / 2).toBeCloseTo(laPaz.latitud, 6);
    expect((este + oeste) / 2).toBeCloseTo(laPaz.longitud, 6);
  });
});