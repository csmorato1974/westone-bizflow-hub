import { describe, expect, it } from "vitest";
import { mensajeOnboardingComercial, type PrecioOnboardingSnapshot } from "@/lib/onboardingComercial";

const item = (numero: number): PrecioOnboardingSnapshot => ({
  producto_id: `producto-${numero}`,
  variante_id: `variante-${numero}`,
  sku: `W-${numero}`,
  nombre: `Producto ${numero}`,
  linea: "refrigerante",
  presentacion: `${numero}L`,
  precio: 10 * numero,
  stock: numero,
  imagen_url: null,
});

describe("onboarding comercial", () => {
  it("incluye cliente, vendedor, lista, precios y portal", () => {
    const mensaje = mensajeOnboardingComercial({
      contacto: "Ana Pérez",
      empresa: "Repuestos Norte",
      vendedorNombre: "Sergio",
      listaNombre: "Mayorista",
      portalUrl: `https://westone.vinculovirtual.com/portal/${"a".repeat(64)}`,
      items: [item(1), item(2)],
      generadoEn: "2026-09-04T12:00:00.000Z",
    });

    expect(mensaje).toContain("Hola Ana Pérez");
    expect(mensaje).toContain("Soy Sergio");
    expect(mensaje).toContain("lista Mayorista");
    expect(mensaje).toContain("Producto 1 1L — Bs 10.00");
    expect(mensaje).toContain(`https://westone.vinculovirtual.com/portal/${"a".repeat(64)}`);
  });

  it("resume el mensaje pero informa los productos adicionales", () => {
    const mensaje = mensajeOnboardingComercial({
      contacto: "Ana",
      empresa: "Repuestos Norte",
      vendedorNombre: "Sergio",
      listaNombre: "Mayorista",
      portalUrl: `https://westone.vinculovirtual.com/portal/${"a".repeat(64)}`,
      items: [1, 2, 3, 4, 5, 6, 7].map(item),
      generadoEn: "2026-09-04T12:00:00.000Z",
    });

    expect(mensaje).toContain("Y 2 presentación(es) más");
    expect(mensaje).not.toContain("Producto 6");
  });

});
