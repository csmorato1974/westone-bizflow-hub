import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Flame, MapPin } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bs } from "@/lib/reportes";
import { Button } from "@/components/ui/button";
import type { DashboardMapaCliente } from "@/lib/dashboardComercial";
import {
  boundsDeClientes,
  colorIntensidad,
  normalizarIntensidad,
  puntosValidos,
  radioIntensidad,
  ZOOM_DETALLE,
  ZOOM_MAX,
  ZOOM_MIN,
  type LatLngBounds,
} from "@/lib/mapaComercial";

const ALTO = 288;
const CENTRO_FALLBACK: [number, number] = [-16.5, -68.15];

const iconoPin = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" stroke-width="1.5"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4" fill="hsl(var(--primary-foreground))" stroke="none"/></svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -24],
});

/** Ajusta la vista a los clientes actuales cada vez que cambia el conjunto o al pulsar el botón. */
function AjustarBounds({ bounds, señal }: { bounds: LatLngBounds | null; señal: number }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: ZOOM_DETALLE });
  }, [map, bounds, señal]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function MapaComercial({ clientes }: { clientes: DashboardMapaCliente[] }) {
  const [modo, setModo] = useState<"heatmap" | "pines">("heatmap");
  const [señal, setSeñal] = useState(0);
  const seccion = useRef<HTMLDivElement>(null);

  const visibles = useMemo(() => puntosValidos(clientes), [clientes]);
  const bounds = useMemo(() => boundsDeClientes(visibles), [visibles]);
  const intensidadDe = useMemo(() => normalizarIntensidad(visibles.map((c) => c.ventas)), [visibles]);

  return <div className="space-y-2" ref={seccion}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Vista del mapa">
        <Button type="button" size="sm" variant={modo === "heatmap" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "heatmap"} onClick={() => setModo("heatmap")}><Flame className="h-3.5 w-3.5 mr-1" /> Heatmap</Button>
        <Button type="button" size="sm" variant={modo === "pines" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "pines"} onClick={() => setModo("pines")}><MapPin className="h-3.5 w-3.5 mr-1" /> Pines</Button>
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSeñal((s) => s + 1)} disabled={!bounds}><Crosshair className="h-3.5 w-3.5 mr-1" /> Ajustar a clientes</Button>
    </div>

    <div className="relative overflow-hidden rounded-md border bg-muted" style={{ height: ALTO }}>
      {!visibles.length ? (
        <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground px-4">No hay clientes con coordenadas válidas para este filtro.</div>
      ) : (
        <MapContainer
          center={CENTRO_FALLBACK}
          zoom={ZOOM_MIN}
          minZoom={ZOOM_MIN}
          maxZoom={ZOOM_MAX}
          zoomControl={false}
          scrollWheelZoom
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={ZOOM_MAX}
          />
          <ZoomControl position="topright" />
          <AjustarBounds bounds={bounds} señal={señal} />

          {visibles.map((cliente) => {
            const i = intensidadDe(cliente.ventas);
            const detalle = <Popup>
              <p className="font-semibold">{cliente.empresa}</p>
              <p className="text-xs text-muted-foreground">{cliente.ciudad}</p>
              <p className="mt-1">{bs(cliente.ventas)} · {cliente.pedidos} pedidos</p>
            </Popup>;

            if (modo === "pines") {
              return <Marker
                key={cliente.id}
                position={[cliente.latitud, cliente.longitud]}
                icon={iconoPin}
                alt={`${cliente.empresa}, ${cliente.ciudad}: ${bs(cliente.ventas)} en ventas`}
                keyboard
              >{detalle}</Marker>;
            }

            return <CircleMarker
              key={cliente.id}
              center={[cliente.latitud, cliente.longitud]}
              radius={radioIntensidad(i)}
              pathOptions={{ color: colorIntensidad(i, 0.55), weight: 1, fillColor: colorIntensidad(i, 1), fillOpacity: 0.45 }}
              interactive
            >{detalle}</CircleMarker>;
          })}
        </MapContainer>
      )}
    </div>

    {modo === "heatmap" && visibles.length > 0 && <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Menor venta</span>
      <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${colorIntensidad(0.12, 0.9)}, ${colorIntensidad(0.55, 0.9)}, ${colorIntensidad(1, 0.9)})` }} aria-hidden />
      <span>Mayor venta</span>
      <span className="sr-only">Intensidad según ventas del período seleccionado</span>
    </div>}
    {modo === "heatmap" && <p className="text-[11px] text-muted-foreground">Intensidad = ventas del período seleccionado. Selecciona una zona para ver el cliente.</p>}
  </div>;
}