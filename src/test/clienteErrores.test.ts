import { describe, expect, it } from "vitest";
import { mensajeErrorGuardarCliente } from "@/lib/clienteErrores";

describe("mensajes al guardar clientes", () => {
  it("explica claramente cuando el teléfono ya pertenece a otra ficha", () => {
    const mensaje = mensajeErrorGuardarCliente({
      code: "23505",
      message: 'duplicate key value violates unique constraint "clientes_telefono_normalizado_uniq"',
    });

    expect(mensaje).toMatch(/teléfono ya está registrado/i);
    expect(mensaje).not.toMatch(/duplicate key|constraint/i);
  });

  it("reconoce la restricción aunque el código no venga informado", () => {
    expect(
      mensajeErrorGuardarCliente({
        message: 'duplicate key value violates unique constraint "clientes_telefono_normalizado_uniq"',
      }),
    ).toMatch(/otra ficha/i);
  });

  it("conserva los demás mensajes de base de datos", () => {
    expect(mensajeErrorGuardarCliente({ message: "No autorizado" })).toBe("No autorizado");
  });

  it("usa un mensaje seguro si el error no tiene detalle", () => {
    expect(mensajeErrorGuardarCliente(null)).toMatch(/No se pudo guardar/);
  });
});
