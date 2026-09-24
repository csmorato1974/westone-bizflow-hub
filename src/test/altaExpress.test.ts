import { describe, expect, it } from "vitest";
import { extraerDatosAltaExpress, normalizarCelularDictado, normalizarEmailDictado } from "@/lib/altaExpress";

describe("alta express por voz", () => {
  it("extrae los datos dictados con etiquetas", () => {
    const datos = extraerDatosAltaExpress(
      "Empresa Repuestos Norte. Contacto Ana Pérez. Celular +591 700 12 345. Dirección Avenida Blanco Galindo 123, Cochabamba. Notas visitar el lunes.",
    );

    expect(datos).toEqual({
      empresa: "Repuestos Norte",
      contacto: "Ana Pérez",
      celular: "+59170012345",
      direccion: "Avenida Blanco Galindo 123, Cochabamba",
      notas: "visitar el lunes",
    });
  });

  it("normaliza un celular aunque el dictado incluya espacios", () => {
    expect(normalizarCelularDictado("591 700-12345")).toBe("59170012345");
  });

  it("separa una transcripción continua aunque no tenga puntuación", () => {
    const datos = extraerDatosAltaExpress(
      "empresa Casa de Repuestos contacto Ana Pérez celular 591 700 1245 dirección avenida Blanco Galindo 123",
    );

    expect(datos).toEqual({
      empresa: "Casa de Repuestos",
      contacto: "Ana Pérez",
      celular: "5917001245",
      direccion: "avenida Blanco Galindo 123",
    });
  });

  it("reconoce un email dictado y evita adjuntarlo a la dirección", () => {
    const datos = extraerDatosAltaExpress(
      "empresa Lubricantes Sur contacto Ana Pérez celular 59170012345 dirección avenida Blanco Galindo 123 correo ana punto perez arroba gmail punto com",
    );

    expect(datos).toEqual({
      empresa: "Lubricantes Sur",
      contacto: "Ana Pérez",
      celular: "59170012345",
      direccion: "avenida Blanco Galindo 123",
      email: "ana.perez@gmail.com",
    });
  });

  it("separa Dirección y Ciudad correctamente", () => {
    const datos = extraerDatosAltaExpress(
      "Empresa Repuestos Norte. Dirección Avenida Arce 123. Ciudad La Paz.",
    );

    expect(datos).toEqual({
      empresa: "Repuestos Norte",
      direccion: "Avenida Arce 123",
      ciudad: "La Paz",
    });
  });

  it("reconoce Localidad como alias de Ciudad", () => {
    const datos = extraerDatosAltaExpress(
      "Empresa Repuestos Norte. Dirección Avenida Arce 123. Localidad Cochabamba.",
    );

    expect(datos.ciudad).toBe("Cochabamba");
    expect(datos.direccion).toBe("Avenida Arce 123");
  });

  it("no arrastra la ciudad dentro de la dirección", () => {
    const datos = extraerDatosAltaExpress(
      "dirección Avenida Arce 123 ciudad La Paz notas visitar lunes",
    );

    expect(datos.direccion).toBe("Avenida Arce 123");
    expect(datos.direccion).not.toContain("La Paz");
    expect(datos.ciudad).toBe("La Paz");
  });

  it("normaliza correos escritos o dictados", () => {
    expect(normalizarEmailDictado("Ventas Arroba Empresa Punto COM")).toBe("ventas@empresa.com");
    expect(normalizarEmailDictado("ventas@empresa.com")).toBe("ventas@empresa.com");
  });
});