import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estadoOnboarding, mensajePruebaWhatsapp, mensajeBienvenidaOnboarding } from "@/lib/onboardingComercial";

const update = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ update: (c: unknown) => { update(c); return { eq: async () => ({ error: null }) }; } }) },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
import { OnboardingPasos } from "@/components/vendedor/OnboardingPasos";

const base = { id: "c1", empresa: "Repuestos Norte", contacto: "Ana", celular: "59170000000", lista_precio_id: "l1" };
const renderPasos = (extra = {}) => {
  const onLanding = vi.fn();
  render(<OnboardingPasos cliente={{ ...base, ...extra }} userId="u1" vendedorNombre="Sergio" landingBusy={false} onLanding={onLanding} onActualizado={vi.fn()} />);
  return { onLanding };
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); update.mockReset(); });

describe("gate de WhatsApp", () => {
  it("estados por paso", () => {
    expect(estadoOnboarding({})).toMatchObject({ paso: "confirmar_whatsapp", puedeEnviarOnboarding: false, puedeLanding: false });
    expect(estadoOnboarding({ whatsapp_confirmado_en: "x" })).toMatchObject({ paso: "enviar_onboarding", puedeEnviarOnboarding: true, puedeLanding: false });
    expect(estadoOnboarding({ whatsapp_confirmado_en: "x", onboarding_enviado_en: "y" })).toMatchObject({ paso: "landing", puedeLanding: true });
    // Onboarding marcado sin WhatsApp confirmado no habilita la landing.
    expect(estadoOnboarding({ onboarding_enviado_en: "y" }).puedeLanding).toBe(false);
  });

  it("mensaje de prueba y bienvenida", () => {
    expect(mensajePruebaWhatsapp({ contacto: "Ana", empresa: "Repuestos Norte", vendedorNombre: "Sergio" })).toBe(
      "Hola Ana, te saluda Sergio de Westone Performance. Estamos confirmando que este número de WhatsApp corresponde a Repuestos Norte. ¿Nos confirmas por favor?",
    );
    expect(mensajeBienvenidaOnboarding({ contacto: "Ana", empresa: "R", vendedorNombre: "S" })).not.toContain("/portal/");
  });

  it("abrir el mensaje de prueba no confirma el número", () => {
    const open = vi.fn(); vi.stubGlobal("open", open);
    renderPasos();
    expect(screen.getByRole("button", { name: /Enviar onboarding/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Landing personalizada/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Mensaje de prueba/ }));
    expect(open.mock.calls[0][0]).toContain("wa.me/59170000000");
    expect(update).not.toHaveBeenCalled();
  });

  it("confirmar WhatsApp es una acción manual explícita", async () => {
    renderPasos();
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp confirmado/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ whatsapp_confirmado_por: "u1" })));
  });

  it("abrir WhatsApp del onboarding no lo marca enviado; marcarlo sí", async () => {
    const open = vi.fn(); vi.stubGlobal("open", open);
    renderPasos({ whatsapp_confirmado_en: "2026-09-24T10:00:00Z" });
    fireEvent.click(screen.getByRole("button", { name: /Enviar onboarding/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Abrir WhatsApp/ }));
    expect(open).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Marcar onboarding enviado/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ onboarding_enviado_por: "u1", onboarding_canal: "whatsapp" })));
  });

  it("landing habilitada tras confirmar y enviar", () => {
    const { onLanding } = renderPasos({ whatsapp_confirmado_en: "2026-09-24T10:00:00Z", onboarding_enviado_en: "2026-09-24T11:00:00Z" });
    fireEvent.click(screen.getByRole("button", { name: /Landing personalizada/ }));
    expect(onLanding).toHaveBeenCalled();
  });
});