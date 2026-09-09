import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, MapPin } from "lucide-react";
import { bs } from "@/lib/reportes";
import { Button } from "@/components/ui/button";
import type { DashboardMapaCliente } from "@/lib/dashboardComercial";
import { calcularViewport, colorIntensidad, normalizarIntensidad, posicionEnViewport, tilesDeViewport } from "@/lib/mapaComercial";

const ALTO = 288;

export function MapaComercial({ clientes }: { clientes: DashboardMapaCliente[] }) {
  const [modo, setModo] = useState<"heatmap" | "pines">("heatmap");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAncho(entry.contentRect.width));
    ro.observe(el);
    setAncho(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const viewport = useMemo(() => calcularViewport(clientes, ancho, ALTO), [clientes, ancho]);
  const intensidadDe = useMemo(() => normalizarIntensidad(clientes.map((c) => c.ventas)), [clientes]);

  const activo = clientes.find((c) => c.id === seleccionado) ?? null;

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Vista del mapa">
        <Button type="button" size="sm" variant={modo === "heatmap" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "heatmap"} onClick={() => setModo("heatmap")}><Flame className="h-3.5 w-3.5 mr-1" /> Heatmap</Button>
        <Button type="button" size="sm" variant={modo === "pines" ? "default" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={modo === "pines"} onClick={() => setModo("pines")}><MapPin className="h-3.5 w-3.5 mr-1" /> Pines</Button>
      </div>
    </div>

    <div ref={contenedor} className="relative overflow-hidden rounded-md border bg-muted" style={{ height: ALTO }} aria-label="Mapa comercial de clientes">
      {!clientes.length || !viewport ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No hay clientes con coordenadas válidas para este filtro.</div>
      ) : <>
        {tilesDeViewport(viewport).map((tile) => <img
          key={tile.key}
          src={`https://tile.openstreetmap.org/${Math.round(viewport.zoom)}/${tile.x}/${tile.y}.png`}
          alt=""
          className="absolute h-64 w-64 max-w-none select-none"
          style={{ left: tile.left, top: tile.top, transform: `scale(${2 ** (viewport.zoom - Math.round(viewport.zoom))})`, transformOrigin: "top left" }}
          loading="lazy"
        />)}

        {modo === "heatmap" && clientes.map((cliente) => {
          const { left, top } = posicionEnViewport(cliente, viewport);
          const i = intensidadDe(cliente.ventas);
          const radio = 26 + i * 42;
          return <div key={`heat-${cliente.id}`} className="pointer-events-none absolute rounded-full" style={{
            left: left - radio,
            top: top - radio,
            width: radio * 2,
            height: radio * 2,
            background: `radial-gradient(circle, ${colorIntensidad(i, 0.8)} 0%, ${colorIntensidad(i, 0.35)} 45%, transparent 70%)`,
            mixBlendMode: "multiply",
          }} />;
        })}

        {clientes.map((cliente) => {
          const { left, top } = posicionEnViewport(cliente, viewport);
          const seleccion = cliente.id === seleccionado;
          return <button
            key={cliente.id}
            type="button"
            className={modo === "pines"
              ? "absolute -translate-x-1/2 -translate-y-full text-primary drop-shadow-md hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
              : `absolute -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${seleccion ? "border-foreground bg-background/40" : "border-transparent"}`}
            style={{ left, top }}
            onClick={() => setSeleccionado(cliente.id)}
            aria-label={`${cliente.empresa}, ${cliente.ciudad}: ${bs(cliente.ventas)} en ventas`}
          >{modo === "pines" ? <MapPin className="h-7 w-7 fill-primary-foreground" /> : null}</button>;
        })}

        {activo && <div className="absolute left-3 top-3 max-w-[240px] rounded-md border bg-background/95 p-3 shadow-lg text-sm">
          <button className="absolute right-2 top-1 text-muted-foreground" onClick={() => setSeleccionado(null)} aria-label="Cerrar detalle">×</button>
          <p className="font-semibold pr-4">{activo.empresa}</p>
          <p className="text-xs text-muted-foreground">{activo.ciudad}</p>
          <p className="mt-2">{bs(activo.ventas)} · {activo.pedidos} pedidos</p>
        </div>}

        <div className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px]">
          © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </div>
      </>}
    </div>

    {modo === "heatmap" && clientes.length > 0 && <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Menor venta</span>
      <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${colorIntensidad(0.12, 0.9)}, ${colorIntensidad(0.55, 0.9)}, ${colorIntensidad(1, 0.9)})` }} aria-hidden />
      <span>Mayor venta</span>
      <span className="sr-only">Intensidad según ventas del período seleccionado</span>
    </div>}
    {modo === "heatmap" && <p className="text-[11px] text-muted-foreground">Intensidad = ventas del período seleccionado. Tocá una zona para ver el cliente.</p>}
  </div>;
}