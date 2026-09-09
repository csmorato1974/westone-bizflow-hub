import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3, Loader2, MapPinned, Package, ShoppingCart, Trophy, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bs, mesLabel } from "@/lib/reportes";
import { DASHBOARD_FILTROS_INICIALES, DASHBOARD_PERIODOS, dashboardRpcParams, type DashboardComercialData, type DashboardFiltrosValue } from "@/lib/dashboardComercial";
import { MapaComercial } from "@/components/dashboard/MapaComercial";

export function DashboardComercial() {
  const { isAdmin, user } = useAuth();
  const [filtros, setFiltros] = useState<DashboardFiltrosValue>(DASHBOARD_FILTROS_INICIALES);
  const [datos, setDatos] = useState<DashboardComercialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const cargar = async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("dashboard_comercial", dashboardRpcParams(filtros));
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
      setDatos(data as unknown as DashboardComercialData);
      setLoading(false);
    };
    void cargar();
    return () => { cancelled = true; };
  }, [user, filtros]);

  if (loading && !datos) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando inteligencia comercial…</div>;
  if (error) return <Card><CardContent className="pt-6 text-sm text-destructive">No se pudo cargar el dashboard comercial: {error}</CardContent></Card>;
  if (!datos) return null;

  const { kpis } = datos;
  const clienteBase = isAdmin ? "/app/admin/clientes" : "/app/clientes";

  return <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`} aria-busy={loading}>
    <Card><CardContent className="pt-4"><div className="flex flex-wrap gap-3 items-center">
      <div className="font-semibold mr-auto">Inteligencia comercial</div>
      <Select value={filtros.periodo} onValueChange={(periodo: DashboardFiltrosValue["periodo"]) => setFiltros((f) => ({ ...f, periodo }))}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{DASHBOARD_PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
      <Select value={filtros.ciudad} onValueChange={(ciudad) => setFiltros((f) => ({ ...f, ciudad }))}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Ciudad / zona" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas las ciudades</SelectItem>{datos.filtros.ciudades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      {isAdmin && <Select value={filtros.vendedorId} onValueChange={(vendedorId) => setFiltros((f) => ({ ...f, vendedorId }))}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Vendedor" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los vendedores</SelectItem>{datos.filtros.vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent></Select>}
    </div></CardContent></Card>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon={BarChart3} label="Ventas" value={bs(kpis.ventas)} />
      <Kpi icon={ShoppingCart} label="Pedidos" value={String(kpis.pedidos)} />
      <Kpi icon={Package} label="Ticket promedio" value={bs(kpis.ticket_promedio)} />
      <Kpi icon={Users} label="Clientes con compra" value={String(kpis.clientes_activos)} />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2 overflow-hidden"><CardHeader className="pb-3"><CardTitle className="text-base">Evolución de ventas</CardTitle></CardHeader><CardContent className="px-2 pb-4 sm:px-6"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={datos.serie} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="ventasArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="mes" tickFormatter={mesLabel} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={22}/><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={48}/><Tooltip content={<VentasTooltip />}/><Area dataKey="total" type="monotone" stroke="hsl(var(--brand-dark))" strokeWidth={3} fill="url(#ventasArea)" dot={{ r: 4, fill: "hsl(var(--brand))", stroke: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 6, fill: "hsl(var(--brand))", stroke: "hsl(var(--foreground))", strokeWidth: 2 }}/></AreaChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2 items-center"><MapPinned className="h-4 w-4"/> Mapa comercial</CardTitle></CardHeader><CardContent><MapaComercial clientes={datos.mapa} /><p className="mt-2 text-xs text-muted-foreground">{datos.mapa.length} clientes ubicados. Selecciona un marcador para ver sus ventas en el período.</p></CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="overflow-hidden"><CardHeader className="pb-3"><CardTitle className="text-base">Ventas por ciudad / zona</CardTitle></CardHeader><CardContent className="px-2 pb-4 sm:px-6"><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={datos.ventas_ciudad} layout="vertical" margin={{ left: 4, right: 16 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" horizontal={false}/><XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }}/><YAxis type="category" dataKey="ciudad" width={100} tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} tickLine={false} axisLine={false}/><Tooltip content={<CiudadTooltip />}/><Bar dataKey="total" fill="hsl(var(--brand))" radius={[0,4,4,0]} maxBarSize={28}/></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/30 py-4"><CardTitle className="text-base flex gap-2 items-center"><Trophy className="h-4 w-4 text-brand"/> Ranking vendedores</CardTitle></CardHeader><CardContent className="p-0">{datos.ranking.length === 0 ? <div className="p-5"><Empty /></div> : datos.ranking.map((r, i) => <div key={r.vendedor_id} className="group flex items-center gap-3 border-b px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/40"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-foreground">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nombre}</span><div className="shrink-0 text-right"><strong className="block text-sm tabular-nums">{bs(r.total)}</strong><span className="text-xs text-muted-foreground">{r.pedidos} ped.</span></div></div>)}</CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="overflow-hidden"><SectionHeader title="Top clientes"/><CardContent className="p-0">{datos.top_clientes.length === 0 ? <div className="p-5"><Empty /></div> : datos.top_clientes.map((c, i) => <div key={c.cliente_id} className="flex items-center gap-3 border-b px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/40"><Position value={i + 1}/><Link className="min-w-0 flex-1 truncate text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" to={`${clienteBase}?focus=${c.cliente_id}`}>{c.empresa}</Link><strong className="shrink-0 text-sm tabular-nums">{bs(c.total)}</strong></div>)}</CardContent></Card>
      <Card className="overflow-hidden"><SectionHeader title="Top productos"/><CardContent className="p-0">{datos.top_productos.length === 0 ? <div className="p-5"><Empty /></div> : datos.top_productos.map((p, i) => <div key={p.producto_id} className="flex items-center gap-3 border-b px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/40"><Position value={i + 1}/><span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.cantidad} u.</span></div>)}</CardContent></Card>
      <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/30 py-4"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-brand-dark"/> Oportunidades</CardTitle></CardHeader><CardContent className="p-0">{datos.oportunidades.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Sin alertas de inactividad en este filtro.</p> : datos.oportunidades.map((c) => <div key={c.id} className="border-b px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/40"><Link className="inline-block text-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" to={`${clienteBase}?focus=${c.id}`}>{c.empresa}</Link><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Sin compra reciente dentro del período seleccionado.</p></div>)}</CardContent></Card>
    </div>
  </div>;
}

function Empty() {
  return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>;
}

function Position({ value }: { value: number }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold">{value}</span>;
}

function SectionHeader({ title }: { title: string }) {
  return <CardHeader className="border-b bg-muted/30 py-4"><CardTitle className="text-base">{title}</CardTitle></CardHeader>;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ value?: number }>;
}

function VentasTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"><p className="text-xs text-muted-foreground">{label ? mesLabel(label) : ""}</p><p className="mt-1 text-sm font-semibold">{bs(payload[0]?.value)}</p></div>;
}

function CiudadTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{bs(payload[0]?.value)}</p></div>;
}

function Kpi({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return <Card><CardContent className="pt-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/><span className="text-xs uppercase tracking-wide">{label}</span></div><p className="industrial-title text-2xl mt-2">{value}</p></CardContent></Card>;
}