import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Flame, MapPin } from "lucide-react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bs } from "@/lib/reportes";
import { Button } from "@/components/ui/button";
import type { DashboardMapaGeo } from "@/lib/dashboardComercial";
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

export const MENSAJE_VACIO = {
  pines: "No hay clientes con GPS verificado para este filtro.",
  heatmap: "No hay referencias geográficas disponibles para este filtro.",
} as const;

export function MapaComercial({ mapaGeo }: { mapaGeo: DashboardMapaGeo }) {
  const [modo, setModo] = useState<"heatmap" | "pines">("heatmap");
  const [señal, setSeñal] = useState(0);
  const seccion = useRef<HTMLDivElement>(null);
  const { metricas } = mapaGeo;

  const pines = useMemo(() => puntosValidos(mapaGeo.pines ?? []), [mapaGeo.pines]);
  const zonas = useMemo(() => puntosValidos(mapaGeo.heatmap ?? []), [mapaGeo.heatmap]);
  const activos = modo === "pines" ? pines : zonas;
  const bounds = useMemo(() => boundsDeClientes(activos), [activos]);
  const intensidadDe = useMemo(() => normalizarIntensidad(zonas.map((z) => z.ventas)), [zonas]);

  return <div className="space-y-2" ref={seccion}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Vista del mapa">
        <Button type="button" size="sm" variant={modo === "heatmap" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "heatmap"} onClick={() => setModo("heatmap")}><Flame className="h-3.5 w-3.5 mr-1" /> Heatmap</Button>
        <Button type="button" size="sm" variant={modo === "pines" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "pines"} onClick={() => setModo("pines")}><MapPin className="h-3.5 w-3.5 mr-1" /> Pines</Button>
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSeñal((s) => s + 1)} disabled={!bounds}><Crosshair className="h-3.5 w-3.5 mr-1" /> Ajustar a clientes</Button>
    </div>

    <div className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Cobertura GPS">
      <span className="rounded-full border px-2 py-0.5">{metricas.con_gps} con GPS · {metricas.pendientes_gps} pendientes GPS</span>
      {metricas.sin_referencia_geo > 0 && <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{metricas.sin_referencia_geo} sin referencia geográfica</span>}
    </div>

    <div className="relative overflow-hidden rounded-md border bg-muted" style={{ height: ALTO }}>
      {!activos.length ? (
        <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground px-4">{MENSAJE_VACIO[modo]}</div>
      ) : (
        <MapContainer
          key={modo}
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

          {modo === "pines" && pines.map((c) => <Marker
            key={c.id}
            position={[c.latitud, c.longitud]}
            icon={iconoPin}
            alt={`${c.empresa}, ${c.ciudad}: ${bs(c.ventas)} en ventas`}
            keyboard
          ><Popup>
            <p className="font-semibold">{c.empresa}</p>
            <p className="text-xs text-muted-foreground">{c.zona ? `${c.ciudad} · ${c.zona}` : c.ciudad}</p>
            <p className="mt-1">{bs(c.ventas)} · {c.pedidos} pedidos</p>
          </Popup></Marker>)}

          {modo === "heatmap" && zonas.map((z) => {
            const i = intensidadDe(z.ventas);
            return <CircleMarker
              key={z.clave}
              center={[z.latitud, z.longitud]}
              radius={radioIntensidad(i)}
              pathOptions={{ color: colorIntensidad(i, 0.55), weight: 1, fillColor: colorIntensidad(i, 1), fillOpacity: 0.45 }}
              interactive
            ><Popup>
              {z.origen === "zona"
                ? <><p className="font-semibold">Zona: {z.nombre}</p><p className="text-xs text-muted-foreground">{z.ciudad} · {z.cantidad_clientes} clientes</p></>
                : <><p className="font-semibold">{z.ciudad} · referencia aproximada de ciudad</p><p className="text-xs text-muted-foreground">No es una ubicación exacta · {z.cantidad_clientes} clientes</p></>}
              <p className="mt-1">{bs(z.ventas)} · {z.pedidos} pedidos</p>
              <p className="text-xs text-muted-foreground">{z.clientes_con_gps} con GPS · {z.clientes_pendientes_gps} pendientes GPS</p>
            </Popup></CircleMarker>;
          })}
        </MapContainer>
      )}
    </div>

    {modo === "heatmap" && zonas.length > 0 && <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Menor venta</span>
      <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${colorIntensidad(0.12, 0.9)}, ${colorIntensidad(0.55, 0.9)}, ${colorIntensidad(1, 0.9)})` }} aria-hidden />
      <span>Mayor venta</span>
      <span className="sr-only">Intensidad según ventas del período seleccionado</span>
    </div>}
    {modo === "heatmap" && <p className="text-[11px] text-muted-foreground">Intensidad = ventas agregadas del período. La ubicación de zona/ciudad es referencial, no exacta.</p>}
  </div>;
}