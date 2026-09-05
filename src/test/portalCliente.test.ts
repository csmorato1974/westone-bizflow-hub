import { describe, expect, it } from "vitest";
import {
  calcularTotalCarrito,
  construirPortalUrl,
  DISPONIBILIDAD_LABEL,
  normalizarTelefonoWhatsapp,
  type ItemCarritoPortal,
} from "@/lib/portalCliente";

const item = (precio: number, cantidad: number): ItemCarritoPortal => ({
  variante_id: crypto.randomUUID(),
  producto_id: crypto.randomUUID(),
  nombre: "Coolant Westone",
  presentacion: "5L",
  precio,
  cantidad,
});

describe("portal personalizado", () => {
  it("construye el enlace en el dominio de la app y no conserva /login", () => {
    const url = construirPortalUrl("a".repeat(64), "https://westone.vinculovirtual.com/login");
    expect(url).toBe(`https://westone.vinculovirtual.com/portal/${"a".repeat(64)}`);
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
