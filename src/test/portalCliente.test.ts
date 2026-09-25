import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calcularTotalCarrito,
  construirPortalUrl,
  DISPONIBILIDAD_LABEL,
  normalizarTelefonoWhatsapp,
  type ItemCarritoPortal,
} from "@/lib/portalCliente";
import { appLoginUrl } from "@/lib/onboarding";

const PROD = "https://westone.vinculovirtual.com";

const item = (precio: number, cantidad: number): ItemCarritoPortal => ({
  variante_id: crypto.randomUUID(),
  producto_id: crypto.randomUUID(),
  nombre: "Coolant Westone",
  presentacion: "5L",
  precio,
  cantidad,
});

describe("portal personalizado", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    "http://localhost:8080",
    "https://id-preview--89702de2-038c-4675-a941-ce892ee3fb76.lovable.app",
    "https://staging.westone.vinculovirtual.com",
    PROD,
  ])("construye portal y login con el origen del entorno %s", (origin) => {
    vi.stubGlobal("window", { location: { origin } });
    expect(construirPortalUrl("b".repeat(64))).toBe(`${origin}/portal/${"b".repeat(64)}`);
    expect(appLoginUrl()).toBe(`${origin}/login`);
  });

  it("un token de STAGING nunca se enlaza al dominio de producción", () => {
    vi.stubGlobal("window", { location: { origin: "https://staging.westone.vinculovirtual.com" } });
    const url = construirPortalUrl("c".repeat(64));
    expect(url.startsWith(`${PROD}/`)).toBe(false);
    expect(appLoginUrl().startsWith(`${PROD}/`)).toBe(false);
  });

  it("usa el dominio público solo sin navegador", () => {
    vi.stubGlobal("window", undefined);
    expect(construirPortalUrl("a".repeat(64))).toBe(`${PROD}/portal/${"a".repeat(64)}`);
  });

  it("calcula el total referencial del carrito", () => {
    expect(calcularTotalCarrito([item(25.5, 2), item(10, 3)])).toBe(81);
  });

  it("muestra disponibilidad sin revelar cantidades exactas", () => {
    expect(DISPONIBILIDAD_LABEL.disponible).toBe("Disponible");
    expect(DISPONIBILIDAD_LABEL.poco_stock).toBe("Poco stock");
    expect(DISPONIBILIDAD_LABEL.consultar).toBe("Consultar");
    expect(Object.values(DISPONIBILIDAD_LABEL).join(" ")).not.toMatch(/\d/);
  });

  it("normaliza teléfonos aptos para WhatsApp", () => {
    expect(normalizarTelefonoWhatsapp("+591 700-12345")).toBe("59170012345");
    expect(normalizarTelefonoWhatsapp("123")).toBeNull();
  });
});