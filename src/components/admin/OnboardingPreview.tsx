import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Mail, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  ASUNTO_EMAIL,
  cuerpoEmail,
  mensajeWhatsapp,
  type OnboardingVars,
} from "@/lib/onboarding";

export interface OnboardingPreviewData {
  empresa: string;
  contacto: string;
  celular: string;
  emailDestino: string | null;
  vars: OnboardingVars;
}

interface Props {
  data: OnboardingPreviewData | null;
  canal: "whatsapp" | "email";
  onCanalChange: (c: "whatsapp" | "email") => void;
  onOpenChange: (open: boolean) => void;
  onConfirmWhatsapp: () => void;
  onConfirmEmail: () => void;
}

const copiar = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Texto copiado");
  } catch {
    toast.error("No se pudo copiar");
  }
};

export function OnboardingPreview({
  data,
  canal,
  onCanalChange,
  onOpenChange,
  onConfirmWhatsapp,
  onConfirmEmail,
}: Props) {
  const wa = data ? mensajeWhatsapp(data.vars) : "";
  const mail = data ? cuerpoEmail(data.vars) : "";

  return (
    <Dialog open={!!data} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="industrial-title">Vista previa del mensaje</DialogTitle>
          <DialogDescription>
            Revisá el texto con los datos reales antes de abrir WhatsApp o el correo.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm space-y-0.5">
              <p className="font-semibold">{data.empresa}</p>
              <p className="text-muted-foreground">
                {data.contacto || "—"} · 📞 {data.celular || "—"}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Email destino: {data.emailDestino ?? "sin email real"}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Usuario: <strong>{data.vars.username || "—"}</strong> · Clave:{" "}
                <strong>{data.vars.clave_provisional}</strong>
              </p>
              <p className="text-xs text-muted-foreground break-all">
                Login: {data.vars.url_login}
              </p>
            </div>

            <Tabs value={canal} onValueChange={(v) => onCanalChange(v as "whatsapp" | "email")}>
              <TabsList className="w-full">
                <TabsTrigger value="whatsapp" className="flex-1">
                  WhatsApp
                </TabsTrigger>
                <TabsTrigger value="email" className="flex-1">
                  Email
                </TabsTrigger>
              </TabsList>

              <TabsContent value="whatsapp" className="space-y-2">
                <Textarea readOnly rows={12} className="text-xs" value={wa} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copiar(wa)}>
                    <Copy className="h-3 w-3" /> Copiar texto
                  </Button>
                  <Button
                    size="sm"
                    className="bg-brand text-brand-foreground hover:bg-brand-dark"
                    disabled={!data.celular}
                    onClick={onConfirmWhatsapp}
                  >
                    <MessageCircle className="h-3 w-3" /> Abrir WhatsApp
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="email" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <strong>Asunto:</strong> {ASUNTO_EMAIL}
                </p>
                <Textarea readOnly rows={12} className="text-xs" value={mail} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copiar(mail)}>
                    <Copy className="h-3 w-3" /> Copiar texto
                  </Button>
                  <Button
                    size="sm"
                    className="bg-brand text-brand-foreground hover:bg-brand-dark"
                    disabled={!data.emailDestino}
                    onClick={onConfirmEmail}
                  >
                    <Mail className="h-3 w-3" /> Abrir Email
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
