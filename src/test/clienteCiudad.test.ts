import { describe, expect, it } from "vitest";
import {
  MENSAJE_CIUDAD_REQUERIDA,
  normalizarCiudad,
  validarCiudadAlta,
} from "@/lib/clienteCiudad";

describe("ciudad obligatoria en el alta de clientes", () => {
  it("rechaza vacío, nulo y solo espacios", () => {
    for (const valor of ["", "   ", "\t\n", null, undefined]) {
      expect(validarCiudadAlta(valor)).toBe(MENSAJE_CIUDAD_REQUERIDA);
    }
  });

  it("acepta una ciudad con contenido real", () => {
    expect(validarCiudadAlta("  Cochabamba ")).toBeNull();
  });

  it("normaliza espacios sobrantes", () => {
    expect(normalizarCiudad("  Santa   Cruz  ")).toBe("Santa Cruz");
    expect(normalizarCiudad("   ")).toBe("");
  });
});