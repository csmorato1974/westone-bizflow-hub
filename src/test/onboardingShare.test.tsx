import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingComercialPreview } from "@/components/vendedor/OnboardingComercialPreview";
import type { OnboardingComercialGenerado } from "@/lib/onboardingComercial";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const cliente = (id: string): OnboardingComercialGenerado => ({
  id, clienteId: id, empresa: `Empresa ${id}`, contacto: `Contacto ${id}`,
  celular: "59170000000", vendedorNombre: "Sergio", listaNombre: "Mayorista",
  portalUrl: `https://westone.vinculovirtual.com/portal/${id}`,
  mensaje: `Hola ${id}. Tu portal de pedidos: https://westone.vinculovirtual.com/portal/${id}`,
  items: [], generadoEn: "2026-09-05T12:00:00Z", canal: "whatsapp",
});

function preparar(soportado = true) {
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn(() => soportado), clipboard: { writeText } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, blob: async () => new Blob(["imagen"], { type: "image/png" }),
  }));
  return { share, writeText };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("compartir onboarding del cliente", () => {
  it("comparte el PNG precargado con el texto y enlace del cliente actualmente abierto", async () => {
    const { share } = preparar();
    const onWhatsapp = vi.fn();
    const { rerender } = render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={onWhatsapp} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir todo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Compartir todo" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].text).toBe(cliente("ana").mensaje);
    expect(share.mock.calls[0][0].files[0]).toMatchObject({ name: "westone-portal-pedidos.png", type: "image/png" });
    rerender(<OnboardingComercialPreview data={cliente("maria")} onClose={vi.fn()} onWhatsapp={onWhatsapp} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir todo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Compartir todo" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(share.mock.calls[1][0].text).toBe(cliente("maria").mensaje);
    expect(onWhatsapp).not.toHaveBeenCalled();
  });

  it("ofrece pasos manuales y copia el enlace sin abrir chats automáticamente", async () => {
    const { share, writeText } = preparar(false);
    const onWhatsapp = vi.fn();
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={onWhatsapp} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir todo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Compartir todo" }));
    expect(screen.getByRole("region", { name: "Envío manual por WhatsApp" })).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
    expect(onWhatsapp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copiar texto y enlace" }));
    expect(writeText).toHaveBeenCalledWith(cliente("ana").mensaje);
    fireEvent.click(screen.getByRole("button", { name: "Abrir chat del cliente" }));
    expect(onWhatsapp).toHaveBeenCalledWith(cliente("ana"));
  });

  it("cancelar el menú no abre un chat ni activa el envío manual", async () => {
    const { share } = preparar();
    share.mockRejectedValue(new DOMException("Cancelado", "AbortError"));
    const onWhatsapp = vi.fn();
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={onWhatsapp} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir todo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Compartir todo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir todo" })).toBeEnabled());
    expect(screen.queryByRole("region", { name: "Envío manual por WhatsApp" })).not.toBeInTheDocument();
    expect(onWhatsapp).not.toHaveBeenCalled();
  });
});
