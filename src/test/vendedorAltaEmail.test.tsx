import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import VendedorClientes from "@/pages/vendedor/Clientes";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "vendedor-1", email: "vendedor@westone.test" },
    profile: { full_name: "Vendedor UAT", username: "vendedor" },
  }),
}));

const listeners: Array<() => void> = [];

vi.mock("@/integrations/supabase/client", () => {
  const query = (data: unknown[]) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const metodo of ["select", "eq", "order", "limit"]) {
      chain[metodo] = vi.fn(self);
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => query([])),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(function (this: unknown) {
          return this;
        }),
      })),
      removeChannel: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  listeners.length = 0;
});

async function abrirFormulario() {
  render(
    <MemoryRouter>
      <VendedorClientes />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo cliente/i }));
  return screen.findByPlaceholderText("contacto@empresa.com") as Promise<HTMLInputElement>;
}

describe("alta de cliente del vendedor: campo Email", () => {
  it("conserva el email escrito en el estado del formulario", async () => {
    const email = await abrirFormulario();
    fireEvent.change(email, { target: { value: "uat.reserva@example.invalid" } });
    expect(email.value).toBe("uat.reserva@example.invalid");
  });

  it("no recarga la lista ni pierde el email al volver el foco a la ventana", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const email = await abrirFormulario();
    fireEvent.change(email, { target: { value: "uat.reserva@example.invalid" } });
    const consultasAntes = (supabase.from as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect((supabase.from as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(consultasAntes),
    );
    expect(email.value).toBe("uat.reserva@example.invalid");
  });

  it("acepta un email sintético válido y lo conserva hasta cerrar el formulario", async () => {
    const email = await abrirFormulario();
    fireEvent.change(email, { target: { value: "uat.reserva@example.invalid" } });
    expect(email.value).toBe("uat.reserva@example.invalid");
    expect(email.getAttribute("type")).toBe("text");
    expect(email.getAttribute("inputmode")).toBe("email");
  });
});
