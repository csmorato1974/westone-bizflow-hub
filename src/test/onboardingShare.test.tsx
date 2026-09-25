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
  const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn(() => soportado), clipboard: { writeText } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, blob: async () => new Blob(["imagen"], { type: "image/png" }),
  }));
  return { share, writeText, download };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("compartir onboarding del cliente", () => {
  it("comparte imagen y texto completos con enlace en una sola acción Web Share", async () => {
    const { share, download } = preparar();
    const onWhatsapp = vi.fn();
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={onWhatsapp} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir imagen, texto y enlace" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Compartir imagen, texto y enlace" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    // Misma llamada lleva el File de imagen, el mensaje completo con el portalUrl y el título.
    expect(share.mock.calls[0][0].files[0]).toMatchObject({ name: "westone-portal-pedidos.png", type: "image/png" });
    expect(share.mock.calls[0][0].text).toBe(cliente("ana").mensaje);
    expect(share.mock.calls[0][0].text).toContain(cliente("ana").portalUrl);
    expect(share.mock.calls[0][0].title).toBe("Portal de pedidos Westone");
    // Sin descargas ni flujo manual: una sola invocación de compartir.
    expect(download).not.toHaveBeenCalled();
    expect(onWhatsapp).not.toHaveBeenCalled();
  });

  it("no existe flujo manual de preparar/copiar/adjuntar como acción principal", async () => {
    preparar();
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir imagen, texto y enlace" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Preparar WhatsApp integrado/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/adjunta\/abre la imagen/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descargar/ })).not.toBeInTheDocument();
  });

  it("muestra imagen y caption juntos, y permite copiar íntegro el texto con su enlace", async () => {
    const { writeText } = preparar(false);
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={vi.fn()} />);
    const vistaPrevia = screen.getByRole("region", { name: "Vista previa de imagen con pie de foto" });
    expect(vistaPrevia).toContainElement(screen.getByRole("img"));
    expect(vistaPrevia).toHaveTextContent(cliente("ana").mensaje);
    fireEvent.click(screen.getByRole("button", { name: "Copiar texto y enlace" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(cliente("ana").mensaje));
  });

  it("deshabilita compartir si el navegador no admite archivos y avisa de la limitación", async () => {
    preparar(false);
    render(<OnboardingComercialPreview data={cliente("ana")} onClose={vi.fn()} onWhatsapp={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartir imagen, texto y enlace" })).toBeDisabled());
    expect(screen.getByText(/limitación del navegador/i)).toBeInTheDocument();
  });
});