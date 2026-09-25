import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, MessageCircle, Send, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { logAudit } from "@/lib/audit";
import { waLink } from "@/lib/whatsapp";
import { estadoOnboarding, mensajeBienvenidaOnboarding, mensajePruebaWhatsapp } from "@/lib/onboardingComercial";

export interface ClienteOnboardingPasos {
  id: string;
  empresa: string;
  contacto: string;
  celular: string;
  lista_precio_id: string | null;
  whatsapp_confirmado_en?: string | null;
  onboarding_enviado_en?: string | null;
}

interface Props {
  cliente: ClienteOnboardingPasos;
  userId: string | undefined;
  vendedorNombre: string;
  landingBusy: boolean;
  onLanding: () => void;
  onActualizado: () => void | Promise<void>;
}

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

function Paso({ hecho, texto }: { hecho: boolean; texto: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${hecho ? "text-success" : "text-muted-foreground"}`}>
      {hecho ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {texto}
    </li>
  );
}

export function OnboardingPasos({ cliente, userId, vendedorNombre, landingBusy, onLanding, onActualizado }: Props) {
  const estado = estadoOnboarding(cliente);
  const [guardando, setGuardando] = useState(false);
  const [dialogo, setDialogo] = useState(false);
  const [whatsappAbierto, setWhatsappAbierto] = useState(false);
  const datos = { contacto: cliente.contacto, empresa: cliente.empresa, vendedorNombre };
  const mensajeOnboarding = mensajeBienvenidaOnboarding(datos);

  const abrir = (mensaje: string) => window.open(waLink(cliente.celular, mensaje), "_blank", "noopener,noreferrer");

  const pruebaWhatsapp = async () => {
    abrir(mensajePruebaWhatsapp(datos));
    toast.message("WhatsApp abierto. Envía el mensaje y espera la respuesta del cliente antes de confirmar.");
    await logAudit("whatsapp_prueba_abierto", "clientes", cliente.id, {});
  };

  const actualizar = async (cambios: TablesUpdate<"clientes">, accion: string, ok: string) => {
    if (!userId) return;
    setGuardando(true);
    const { error } = await supabase.from("clientes").update(cambios).eq("id", cliente.id);
    setGuardando(false);
    if (error) return toast.error("No se pudo guardar: " + error.message);
    await logAudit(accion, "clientes", cliente.id, { ...cambios });
    toast.success(ok);
    await onActualizado();
  };

  const confirmarWhatsapp = () =>
    actualizar(
      { whatsapp_confirmado_en: new Date().toISOString(), whatsapp_confirmado_por: userId! },
      "whatsapp_confirmado",
      "WhatsApp confirmado",
    );

  const marcarEnviado = async () => {
    await actualizar(
      { onboarding_enviado_en: new Date().toISOString(), onboarding_canal: "whatsapp", onboarding_enviado_por: userId! },
      "onboarding_marcado_enviado",
      "Onboarding marcado como enviado",
    );
    setDialogo(false);
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2" aria-label={`Onboarding de ${cliente.empresa}`}>
      <ol className="space-y-0.5">
        <Paso hecho={estado.whatsappConfirmado} texto={estado.whatsappConfirmado ? `WhatsApp confirmado · ${fecha(cliente.whatsapp_confirmado_en!)}` : "1. Confirmar WhatsApp"} />
        <Paso hecho={estado.onboardingEnviado} texto={estado.onboardingEnviado ? `Onboarding enviado · ${fecha(cliente.onboarding_enviado_en!)}` : "2. Enviar onboarding"} />
        <Paso hecho={false} texto="3. Landing personalizada" />
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {!estado.whatsappConfirmado && (
          <>
            <Button size="sm" variant="outline" onClick={pruebaWhatsapp} disabled={!cliente.celular}>
              <MessageCircle className="h-3 w-3" /> Mensaje de prueba por WhatsApp
            </Button>
            <Button size="sm" variant="outline" onClick={confirmarWhatsapp} disabled={guardando}>
              {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} WhatsApp confirmado
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!estado.puedeEnviarOnboarding}
          title={estado.puedeEnviarOnboarding ? undefined : "Primero confirma el WhatsApp del cliente"}
          onClick={() => { setWhatsappAbierto(false); setDialogo(true); }}
        >
          <Send className="h-3 w-3" /> {estado.onboardingEnviado ? "Reenviar onboarding" : "Enviar onboarding"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!estado.puedeLanding || !cliente.lista_precio_id || landingBusy}
          title={!estado.puedeLanding ? "Requiere WhatsApp confirmado y onboarding enviado" : !cliente.lista_precio_id ? "Asigná una lista de precios" : undefined}
          onClick={onLanding}
        >
          {landingBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Store className="h-3 w-3" />} Landing personalizada
        </Button>
      </div>

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="industrial-title">Enviar onboarding</DialogTitle>
            <DialogDescription>
              Para {cliente.contacto} · {cliente.empresa} ({cliente.celular}). El envío es manual: abrir WhatsApp no marca el mensaje como enviado.
            </DialogDescription>
          </DialogHeader>
          <Textarea readOnly rows={11} className="text-xs" value={mensajeOnboarding} aria-label="Vista previa del onboarding" />
          <p className="text-xs text-muted-foreground">
            1) Abre WhatsApp y pulsa Enviar en el chat. 2) Vuelve aquí y marca el onboarding como enviado.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { abrir(mensajeOnboarding); setWhatsappAbierto(true); void logAudit("onboarding_whatsapp_abierto", "clientes", cliente.id, {}); }}>
              <ExternalLink className="h-4 w-4" /> Abrir WhatsApp
            </Button>
            <Button className="bg-brand text-brand-foreground hover:bg-brand-dark" onClick={marcarEnviado} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Marcar onboarding enviado
            </Button>
          </DialogFooter>
          {whatsappAbierto && <p className="text-xs" role="status">WhatsApp abierto. Confirma solo si realmente enviaste el mensaje.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}