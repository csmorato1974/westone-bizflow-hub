import { describe, expect, it } from "vitest";
import {
  claveProvisional,
  normalizarTanda,
  TANDA_DEFECTO,
  TANDA_MAX,
  TANDA_MIN,
} from "../../supabase/functions/reset-provisional-password/clave";

describe("claveProvisional", () => {
  it("deriva la clave estándar del email provisional", () => {
    expect(claveProvisional("autopartes.edmar@clientes-temp.local")).toBe("Wst-autopartes.edmar-26");
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(claveProvisional("  Autopartes.Edmar@Clientes-Temp.Local ")).toBe(
      "Wst-autopartes.edmar-26",
    );
  });

  it("rechaza emails reales", () => {
    expect(claveProvisional("cliente@gmail.com")).toBeNull();
  });

  it("rechaza vacíos y parte local vacía", () => {
    expect(claveProvisional(null)).toBeNull();
    expect(claveProvisional("")).toBeNull();
    expect(claveProvisional("@clientes-temp.local")).toBeNull();
  });

  it("es determinista: dos llamadas dan la misma clave (idempotencia)", () => {
    const a = claveProvisional("negocio.uno@clientes-temp.local");
    const b = claveProvisional("negocio.uno@clientes-temp.local");
    expect(a).toBe(b);
  });
});

describe("normalizarTanda", () => {
  it("usa el valor por defecto si no llega nada", () => {
    expect(normalizarTanda()).toBe(TANDA_DEFECTO);
    expect(normalizarTanda(undefined)).toBe(TANDA_DEFECTO);
  });

  it("acota al rango 25-50", () => {
    expect(normalizarTanda(1)).toBe(TANDA_MIN);
    expect(normalizarTanda(500)).toBe(TANDA_MAX);
    expect(normalizarTanda(37)).toBe(37);
  });
});
