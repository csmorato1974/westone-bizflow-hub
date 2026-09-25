import { useEffect, useState } from "react";
import { Copy, ExternalLink, ImageOff, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { WestoneLogo } from "@/components/WestoneLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OnboardingComercialGenerado } from "@/lib/onboardingComercial";
import { productImageUrl } from "@/lib/productImage";

interface Props {
  data: OnboardingComercialGenerado | null;
  onClose: () => void;
  onWhatsapp: (data: OnboardingComercialGenerado) => void;
}

const PROMO_ASSET_URL = "/onboarding/westone-portal-pedidos.png";
const PROMO_ASSET_NAME = "westone-portal-pedidos.png";

export function OnboardingComercialPreview({ data, onClose, onWhatsapp }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargandoImagen, setCargandoImagen] = useState(true);
  const [errorImagen, setErrorImagen] = useState(false);
  const [intentoImagen, setIntentoImagen] = useState(0);
  const [compartiendo, setCompartiendo] = useState(false);

  // Preparar el archivo antes del clic conserva la activación requerida por Web Share.
  useEffect(() => {
    setArchivo(null);
    setErrorImagen(false);
    setCargandoImagen(true);
    if (!data?.id) return;
    const controller = new AbortController();
    const cargar = async () => {
      try {
        const response = await fetch(PROMO_ASSET_URL, { signal: controller.signal });
        if (!response.ok) throw new Error("Imagen no disponible");
        const blob = await response.blob();
        if (!blob.size || blob.type !== "image/png") throw new Error("Imagen no válida");
        if (!controller.signal.aborted) {
          setArchivo(new File([blob], PROMO_ASSET_NAME, { type: "image/png" }));
        }
      } catch {
        if (!controller.signal.aborted) setErrorImagen(true);
      } finally {
        if (!controller.signal.aborted) setCargandoImagen(false);
      }
    };
    void cargar();
    return () => controller.abort();
  }, [data?.id, intentoImagen]);

  const copiar = async (): Promise<boolean> => {
    if (!data) return false;
    try {
      await navigator.clipboard.writeText(data.mensaje);
      toast.success("Mensaje copiado");
      return true;
    } catch {
      toast.error("No se pudo copiar el mensaje");
      return false;
    }
  };

  const compartirPieza = async () => {
    if (!data || !archivo || compartiendo) return;
    setCompartiendo(true);
    try {
      const contenido = {
        files: [archivo],
        title: "Portal de pedidos Westone",
        // El mensaje ya contiene el enlace exclusivo del cliente; no duplicarlo como URL.
        text: data.mensaje,
      };
      if (navigator.share && navigator.canShare?.(contenido)) {
        await navigator.share(contenido);
        toast.message("Contenido entregado al menú de compartir. Algunos dispositivos o versiones de WhatsApp pueden separar la imagen y el texto: es una limitación del navegador, no un envío incompleto.");
        return;
      }
      toast.error("Este navegador no admite compartir imagen y texto juntos.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("No se pudo compartir. Inténtalo de nuevo o usa otro navegador.");
    } finally {
      setCompartiendo(false);
    }
  };

  const puedeCompartir = !!archivo && !!navigator.share && !!navigator.canShare?.({ files: [archivo], text: data?.mensaje });

  return (
    <Dialog open={!!data} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <WestoneLogo />
          <DialogTitle className="industrial-title pt-2">Landing personalizada</DialogTitle>
          <DialogDescription>
            Imagen, mensaje y enlace al portal de pedidos de este cliente, listos para compartir.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">Enviar a: {data.contacto} · {data.empresa}</p>
              <p className="text-muted-foreground">WhatsApp: {data.celular}</p>
              <p className="mt-1 text-xs">En el menú de compartir, elige WhatsApp y selecciona este contacto.</p>
            </div>
            <div className="overflow-hidden rounded-md border bg-background" role="region" aria-label="Vista previa de imagen con pie de foto">
              <div className="bg-foreground">
                <img
                  src={PROMO_ASSET_URL}
                  alt="Portal de pedidos Westone: refrigerantes y anticongelantes de 1 L, 5 L y 20 L. Consulta el catálogo, los precios y la disponibilidad; añade productos al carrito y solicita tu pedido."
                  className="mx-auto w-full object-contain"
                />
              </div>
              <div className="border-t p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Pie de foto para WhatsApp</p>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{data.mensaje}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                onClick={compartirPieza}
                disabled={!puedeCompartir || cargandoImagen || compartiendo}
                className="w-full bg-brand text-brand-foreground hover:bg-brand-dark"
              >
                {cargandoImagen ? <Loader2 className="h-4 w-4 animate-spin" /> : compartiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                {cargandoImagen ? "Preparando imagen…" : compartiendo ? "Compartiendo…" : "Compartir imagen, texto y enlace"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Comparte imagen y texto en una sola acción. Si tu dispositivo los muestra por separado, es una limitación del navegador; el mensaje completo llega igualmente.
              </p>
            </div>
            {errorImagen && (
              <div role="alert" className="text-sm text-destructive">
                No se pudo preparar la imagen.
                <Button type="button" variant="link" onClick={() => setIntentoImagen((valor) => valor + 1)}>Reintentar</Button>
              </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{data.empresa}</p>
              <p className="text-muted-foreground">{data.contacto} · {data.celular}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{data.listaNombre}</Badge>
                <Badge variant="outline">{data.items.length} precios guardados</Badge>
              </div>
            </div>

            <Button asChild variant="outline" className="w-full">
              <a href={data.portalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Abrir portal de pedidos
              </a>
            </Button>

            <div>
              <p className="mb-2 text-sm font-semibold">Snapshot histórico de precios y stock</p>
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
            <Button variant="outline" onClick={() => void copiar()} disabled={!data}>
              <Copy className="h-4 w-4" /> Copiar texto y enlace
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}