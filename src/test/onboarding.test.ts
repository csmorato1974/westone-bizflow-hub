import { describe, expect, it } from "vitest";
import { mensajeBienvenida } from "@/lib/onboarding";

describe("mensajeBienvenida", () => {
  it("reemplaza el enlace heredado por el acceso de la aplicación actual", () => {
    const message = mensajeBienvenida(
      "Hola {contacto}, ingresá en https://westone-bizflow-hub.lovable.app/login",
      { contacto: "Sergio" },
    );

    expect(message).toContain("Hola Sergio");
    expect(message).not.toContain("lovable.app");
    expect(message).toContain("/login");
  });
});
