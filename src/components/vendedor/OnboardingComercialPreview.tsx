import { Copy, Download, ExternalLink, ImageOff, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { WestoneLogo } from "@/components/WestoneLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingComercialGenerado } from "@/lib/onboardingComercial";
import { productImageUrl } from "@/lib/productImage";

interface Props {
  data: OnboardingComercialGenerado | null;
  onClose: () => void;
  onWhatsapp: (data: OnboardingComercialGenerado) => void;
}

const PROMO_ASSET_URL = "/onboarding/westone-presentaciones.png";
const PROMO_ASSET_NAME = "westone-presentaciones-1L-5L-20L.png";

export function OnboardingComercialPreview({ data, onClose, onWhatsapp }: Props) {
  const copiar = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.mensaje);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  };

  const descargarPieza = () => {
    const link = document.createElement("a");
    link.href = PROMO_ASSET_URL;
    link.download = PROMO_ASSET_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Imagen promocional descargada");
  };

  const compartirPieza = async () => {
    if (!data) return;
    try {
      const response = await fetch(PROMO_ASSET_URL);
      if (!response.ok) throw new Error("No se pudo cargar la imagen promocional");
      const file = new File([await response.blob()], PROMO_ASSET_NAME, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Westone Performance",
          text: data.mensaje,
        });
        toast.success("Pieza compartida");
        return;
      }

      descargarPieza();
      toast.message("Tu dispositivo no comparte archivos directamente. Adjunta la imagen descargada en WhatsApp.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "No se pudo compartir la imagen");
    }
  };

  return (
    <Dialog open={!!data} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <WestoneLogo />
          <DialogTitle className="industrial-title pt-2">Onboarding generado</DialogTitle>
          <DialogDescription>
            Revisá el mensaje y los precios registrados antes de abrir WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border bg-black">
              <img
                src={PROMO_ASSET_URL}
                alt="Pieza promocional Westone con presentaciones de 1L, 5L y 20L"
                className="mx-auto max-h-80 w-full object-contain"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={compartirPieza} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                <Share2 className="h-4 w-4" /> Compartir imagen y mensaje
              </Button>
              <Button type="button" variant="outline" onClick={descargarPieza}>
                <Download className="h-4 w-4" /> Descargar imagen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              En el móvil se abrirá el menú para elegir WhatsApp y el contacto. Si no está disponible, la imagen se descargará para adjuntarla manualmente.
            </p>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{data.empresa}</p>
              <p className="text-muted-foreground">{data.contacto} · {data.celular}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{data.listaNombre}</Badge>
                <Badge variant="outline">{data.items.length} precios guardados</Badge>
              </div>
            </div>

            <Textarea readOnly rows={13} className="text-xs" value={data.mensaje} />

            <Button asChild variant="outline" className="w-full">
              <a href={data.portalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Abrir enlace de acceso
              </a>
            </Button>

            <div>
              <p className="mb-2 text-sm font-semibold">Snapshot de precios y stock</p>
              <ScrollArea className="h-44 rounded-md border">
                <div className="divide-y">
                  {data.items.map((item) => (
                    <div key={item.variante_id} className="flex items-center justify-between gap-3 p-2 text-xs">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-background">
                        {item.imagen_url ? (
                          <img
                            src={productImageUrl(item.imagen_url)!}
                            alt={item.nombre}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <ImageOff className="h-5 w-5 text-muted-foreground" aria-label="Producto sin imagen" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.nombre}</p>
                        <p className="text-muted-foreground">{item.presentacion} · {item.sku}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">Bs {item.precio.toFixed(2)}</p>
                        <p className="text-muted-foreground">Stock: {item.stock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <p className="text-[11px] text-muted-foreground break-all">Historial: {data.id}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copiar} disabled={!data}>
              <Copy className="h-4 w-4" /> Copiar
            </Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-dark"
              onClick={() => data && onWhatsapp(data)}
              disabled={!data?.celular}
            >
              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
