import { describe, expect, it } from "vitest";
import { camposDetectados, extraerDatosAltaExpress } from "@/lib/altaExpress";

describe("altaExpress ciudad", () => {
  it("separa ciudad de dirección cuando ambas se dictan", () => {
    const datos = extraerDatosAltaExpress(
      "Empresa Repuestos Norte. Contacto Ana Pérez. Celular 59170012345. Dirección Avenida Arce 123. Ciudad La Paz.",
    );

    expect(datos.direccion).toBe("Avenida Arce 123");
    expect(datos.ciudad).toBe("La Paz");
    expect(camposDetectados(datos)).toContain("ciudad");
  });

  it("acepta localidad como alias de ciudad", () => {
    const datos = extraerDatosAltaExpress(
      "Empresa Taller Central. Contacto Luis. Celular 59170000000. Localidad El Alto.",
    );

    expect(datos.ciudad).toBe("El Alto");
  });

  it("no arrastra ciudad dentro de dirección", () => {
    const datos = extraerDatosAltaExpress(
      "Dirección Avenida Blanco Galindo 456 Ciudad Cochabamba",
    );

    expect(datos.direccion).toBe("Avenida Blanco Galindo 456");
    expect(datos.ciudad).toBe("Cochabamba");
  });
});
