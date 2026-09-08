import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { bs } from "@/lib/reportes";
import type { DashboardMapaCliente } from "@/lib/dashboardComercial";

const TILE = 256;
const ZOOM = 5;
const GRID = 3;

const worldPoint = (lat: number, lon: number, zoom = ZOOM) => {
  const scale = TILE * 2 ** zoom;
  const safeLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

export function MapaComercial({ clientes }: { clientes: DashboardMapaCliente[] }) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const modelo = useMemo(() => {
    if (!clientes.length) return null;
    const centro = clientes.reduce((acc, c) => ({ lat: acc.lat + c.latitud, lon: acc.lon + c.longitud }), { lat: 0, lon: 0 });
    centro.lat /= clientes.length;
    centro.lon /= clientes.length;
    const world = worldPoint(centro.lat, centro.lon);
    const tileX = Math.floor(world.x / TILE);
    const tileY = Math.floor(world.y / TILE);
    const originX = (tileX - 1) * TILE;
    const originY = (tileY - 1) * TILE;
    return {
      originX,
      originY,
      tiles: Array.from({ length: GRID * GRID }, (_, i) => ({ x: tileX - 1 + (i % GRID), y: tileY - 1 + Math.floor(i / GRID) })),
    };
  }, [clientes]);

  if (!modelo) return <div className="h-72 rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">No hay clientes con coordenadas válidas para este filtro.</div>;

  const activo = clientes.find((c) => c.id === seleccionado);
  return <div className="relative h-72 overflow-hidden rounded-md border bg-muted" aria-label="Mapa comercial de clientes">
    <div className="absolute left-1/2 top-1/2" style={{ width: GRID * TILE, height: GRID * TILE, transform: "translate(-50%, -50%)" }}>
      {modelo.tiles.map((tile, i) => <img
        key={`${tile.x}-${tile.y}`}
        src={`https://tile.openstreetmap.org/${ZOOM}/${tile.x}/${tile.y}.png`}
        alt=""
        className="absolute h-64 w-64 max-w-none select-none"
        style={{ left: (i % GRID) * TILE, top: Math.floor(i / GRID) * TILE }}
        loading="lazy"
      />)}
      {clientes.map((cliente) => {
        const point = worldPoint(cliente.latitud, cliente.longitud);
        const left = point.x - modelo.originX;
        const top = point.y - modelo.originY;
        if (left < 0 || top < 0 || left > GRID * TILE || top > GRID * TILE) return null;
        return <button
          key={cliente.id}
          type="button"
          className="absolute -translate-x-1/2 -translate-y-full text-primary drop-shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring rounded-full"
          style={{ left, top }}
          onClick={() => setSeleccionado(cliente.id)}
          aria-label={`${cliente.empresa}, ${cliente.ciudad}`}
        ><MapPin className="h-7 w-7 fill-primary-foreground" /></button>;
      })}
    </div>
    {activo && <div className="absolute left-3 top-3 max-w-[240px] rounded-md border bg-background/95 p-3 shadow-lg text-sm">
      <button className="absolute right-2 top-1 text-muted-foreground" onClick={() => setSeleccionado(null)} aria-label="Cerrar detalle">×</button>
      <p className="font-semibold pr-4">{activo.empresa}</p>
      <p className="text-xs text-muted-foreground">{activo.ciudad}</p>
      <p className="mt-2">{bs(activo.ventas)} · {activo.pedidos} pedidos</p>
    </div>}
    <div className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px]">
      © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
    </div>
  </div>;
}
