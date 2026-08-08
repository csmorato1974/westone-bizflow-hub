import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Crosshair, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { mapsLink } from "@/lib/whatsapp";
import {
  PRECISION_MAXIMA_METROS,
  contextoSeguro,
  formatearCoordenada,
  mensajeErrorGeo,
  precisionAceptable,
  validarCoordenadas,
} from "@/lib/gps";

interface Historial {
  id: string;
  latitud: number;
  longitud: number;
  precision_metros: number | null;
  capturado_en: string;
  capturado_por: string | null;
  fuente: string;
}

interface Props {
  clienteId: string;
  empresa: string;
  /** Ubicación actual guardada en la ficha (opcional). */
  latitud?: number | null;
  longitud?: number | null;
  precisionMetros?: number | null;
  capturadoEn?: string | null;
  capturadoPorNombre?: string | null;
  nombrePorUsuario?: Map<string, string>;
  onGuardado?: () => void;
  /** Oculta el botón cuando el usuario no puede capturar. */
  puedeCapturar?: boolean;
  size?: "sm" | "default";
}

const fecha = (v?: string | null) =>
  v ? new Date(v).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" }) : null;

export function UbicacionGps({
  clienteId,
  empresa,
  latitud,
  longitud,
  precisionMetros,
  capturadoEn,
  capturadoPorNombre,
  nombrePorUsuario,
  onGuardado,
  puedeCapturar = true,
  size = "sm",
}: Props) {
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pendiente, setPendiente] = useState<{ lat: number; lng: number; prec: number | null } | null>(null);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);

  const cargarHistorial = async () => {
    setCargandoHist(true);
    const { data } = await supabase
      .from("cliente_ubicaciones")
      .select("id,latitud,longitud,precision_metros,capturado_en,capturado_por,fuente")
      .eq("cliente_id", clienteId)
      .order("capturado_en", { ascending: false })
      .limit(5);
    setHistorial((data ?? []) as Historial[]);
    setCargandoHist(false);
  };

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const capturar = () => {
    if (!contextoSeguro()) {
      toast.error("La ubicación requiere una conexión segura (HTTPS).");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Este navegador no ofrece geolocalización.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const prec = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null;
        const err = validarCoordenadas({ latitud: lat, longitud: lng, precisionMetros: prec });
        if (err) {
          toast.error(err);
          return;
        }
        setPendiente({ lat, lng, prec });
      },
      (err) => {
        setBuscando(false);
        toast.error(mensajeErrorGeo(err.code, err.message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const confirmar = async () => {
    if (!pendiente) return;
    setGuardando(true);
    const { error } = await supabase.rpc("guardar_ubicacion_cliente", {
      _cliente_id: clienteId,
      _latitud: pendiente.lat,
      _longitud: pendiente.lng,
      _precision_metros: pendiente.prec,
      _fuente: "gps_navegador",
    });
    setGuardando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ubicación guardada");
    setPendiente(null);
    await cargarHistorial();
    onGuardado?.();
  };

  const maps = mapsLink(latitud, longitud);
  const buena = precisionAceptable(pendiente?.prec);
  const quien =
    capturadoPorNombre ??
    (historial[0]?.capturado_por ? nombrePorUsuario?.get(historial[0].capturado_por) : undefined);

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Ubicación GPS</p>
        {latitud != null && longitud != null ? (
          <Badge variant="outline" className="border-success text-success text-xs">Capturada</Badge>
        ) : (
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
            Sin ubicación
          </Badge>
        )}
      </div>

      {latitud != null && longitud != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {formatearCoordenada(latitud)}, {formatearCoordenada(longitud)}
            {precisionMetros != null ? ` · ±${Math.round(precisionMetros)} m` : ""}
          </p>
          {fecha(capturadoEn) && <p>{fecha(capturadoEn)}{quien ? ` · ${quien}` : ""}</p>}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
              <MapPin className="h-3 w-3" /> Abrir en Google Maps
            </a>
          )}
        </div>
      )}

      {puedeCapturar && (
        <Button size={size} variant="outline" onClick={capturar} disabled={buscando}>
          {buscando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
          {buscando ? "Buscando señal…" : "Capturar ubicación GPS"}
        </Button>
      )}

      {historial.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Historial ({historial.length})</summary>
          {cargandoHist ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ul className="space-y-1 pt-1">
              {historial.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-2">
                  <span>{fecha(h.capturado_en)}</span>
                  <span>
                    {formatearCoordenada(h.latitud)}, {formatearCoordenada(h.longitud)}
                    {h.precision_metros != null ? ` · ±${Math.round(h.precision_metros)} m` : ""}
                  </span>
                  {h.capturado_por && nombrePorUsuario?.get(h.capturado_por) && (
                    <span>· {nombrePorUsuario.get(h.capturado_por)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <AlertDialog open={!!pendiente} onOpenChange={(o) => !o && setPendiente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="industrial-title">Confirmar ubicación de {empresa}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Latitud <strong>{formatearCoordenada(pendiente?.lat)}</strong> · Longitud{" "}
                  <strong>{formatearCoordenada(pendiente?.lng)}</strong>
                </p>
                <p>
                  Precisión:{" "}
                  <strong>{pendiente?.prec != null ? `±${pendiente.prec} m` : "desconocida"}</strong>
                </p>
                {!buena && (
                  <p className="flex items-start gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    Precisión insuficiente (mayor a {PRECISION_MAXIMA_METROS} m). Podés reintentar la captura
                    al aire libre o guardarla de todas formas.
                  </p>
                )}
                <p className="text-muted-foreground">
                  Guardá solo si estás físicamente en la dirección del cliente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={guardando}>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={guardando}
              onClick={() => { setPendiente(null); capturar(); }}
            >
              Reintentar
            </Button>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmar(); }}
              disabled={guardando}
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar ubicación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
