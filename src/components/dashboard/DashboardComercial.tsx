import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3, Loader2, MapPinned, Package, ShoppingCart, Trophy, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Evolución de ventas</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={datos.serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mes" tickFormatter={mesLabel} fontSize={10}/><YAxis fontSize={10}/><Tooltip formatter={(value: number) => bs(value)} labelFormatter={mesLabel}/><Line dataKey="total" type="monotone" stroke="currentColor" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2 items-center"><MapPinned className="h-4 w-4"/> Mapa comercial</CardTitle></CardHeader><CardContent><MapaComercial clientes={datos.mapa} /><p className="mt-2 text-xs text-muted-foreground">{datos.mapa.length} clientes ubicados. Selecciona un marcador para ver sus ventas en el período.</p></CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle className="text-base">Ventas por ciudad / zona</CardTitle></CardHeader><CardContent><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={datos.ventas_ciudad} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" fontSize={10}/><YAxis type="category" dataKey="ciudad" width={100} fontSize={10}/><Tooltip formatter={(value: number) => bs(value)}/><Bar dataKey="total" fill="currentColor" radius={[0,3,3,0]}/></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4"/> Ranking vendedores</CardTitle></CardHeader><CardContent className="space-y-2">{datos.ranking.length === 0 ? <Empty /> : datos.ranking.map((r, i) => <div key={r.vendedor_id} className="flex items-center gap-3 border-b last:border-0 pb-2"><span className="font-bold w-5">{i + 1}</span><span className="flex-1 truncate">{r.nombre}</span><span className="text-xs text-muted-foreground">{r.pedidos} ped.</span><strong>{bs(r.total)}</strong></div>)}</CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card><CardHeader><CardTitle className="text-base">Top clientes</CardTitle></CardHeader><CardContent className="space-y-2">{datos.top_clientes.length === 0 ? <Empty /> : datos.top_clientes.map((c, i) => <div key={c.cliente_id} className="flex gap-2 text-sm"><span>{i + 1}</span><Link className="flex-1 truncate hover:underline" to={`${clienteBase}?focus=${c.cliente_id}`}>{c.empresa}</Link><strong>{bs(c.total)}</strong></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Top productos</CardTitle></CardHeader><CardContent className="space-y-2">{datos.top_productos.length === 0 ? <Empty /> : datos.top_productos.map((p, i) => <div key={p.producto_id} className="flex gap-2 text-sm"><span>{i + 1}</span><span className="flex-1 truncate">{p.nombre}</span><span className="text-muted-foreground">{p.cantidad} u.</span></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Oportunidades</CardTitle></CardHeader><CardContent className="space-y-2">{datos.oportunidades.length === 0 ? <p className="text-sm text-muted-foreground">Sin alertas de inactividad en este filtro.</p> : datos.oportunidades.map((c) => <div key={c.id} className="border-b last:border-0 pb-2"><Link className="text-sm font-medium hover:underline" to={`${clienteBase}?focus=${c.id}`}>{c.empresa}</Link><p className="text-xs text-muted-foreground">Sin compra reciente dentro del período seleccionado.</p></div>)}</CardContent></Card>
    </div>
  </div>;
}

function Empty() {
  return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>;
}

function Kpi({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return <Card><CardContent className="pt-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/><span className="text-xs uppercase tracking-wide">{label}</span></div><p className="industrial-title text-2xl mt-2">{value}</p></CardContent></Card>;
}
