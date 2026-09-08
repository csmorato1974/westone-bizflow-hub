import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3, Loader2, MapPin, Package, ShoppingCart, Trophy, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bs, mesLabel, type ReporteVentas } from "@/lib/reportes";
import {
  DASHBOARD_FILTROS_INICIALES,
  DASHBOARD_PERIODOS,
  dashboardDesdeIso,
  type DashboardFiltrosValue,
  type DashboardVendedorOption,
} from "@/lib/dashboardComercial";

type PedidoRow = { id: string; total: number; created_at: string; cliente_id: string; vendedor_id: string | null };
type ClienteRow = { id: string; empresa: string; ciudad: string | null; activo: boolean; latitud: number | null; longitud: number | null; vendedor_id: string | null };
type RankingRow = { vendedorId: string; nombre: string; total: number; pedidos: number };

export function DashboardComercial() {
  const { isAdmin, hasRole, user } = useAuth();
  const esVendedor = hasRole("vendedor") && !isAdmin;
  const [filtros, setFiltros] = useState<DashboardFiltrosValue>(DASHBOARD_FILTROS_INICIALES);
  const [reporte, setReporte] = useState<ReporteVentas | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [vendedores, setVendedores] = useState<DashboardVendedorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const cargar = async () => {
      setLoading(true);
      setError(null);
      const desde = dashboardDesdeIso(filtros.periodo);
      const [rep, cli, ped, roles, profiles] = await Promise.all([
        supabase.rpc("reporte_ventas", { _desde: desde, _hasta: null }),
        supabase.from("clientes").select("id,empresa,ciudad,activo,latitud,longitud,vendedor_id"),
        (() => {
          let q = supabase.from("pedidos").select("id,total,created_at,cliente_id,vendedor_id").neq("estado", "cancelado");
          if (desde) q = q.gte("created_at", desde);
          return q;
        })(),
        isAdmin ? supabase.from("user_roles").select("user_id,role").eq("role", "vendedor") : Promise.resolve({ data: [], error: null }),
        isAdmin ? supabase.from("profiles").select("id,full_name") : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      const fallo = rep.error || cli.error || ped.error || roles.error || profiles.error;
      if (fallo) {
        setError(fallo.message);
        setLoading(false);
        return;
      }
      setReporte(rep.data as unknown as ReporteVentas);
      setClientes((cli.data ?? []) as ClienteRow[]);
      setPedidos((ped.data ?? []) as PedidoRow[]);
      if (isAdmin) {
        const nombres = new Map((profiles.data ?? []).map((p: any) => [p.id, p.full_name || "Vendedor"]));
        setVendedores((roles.data ?? []).map((r: any) => ({ id: r.user_id, nombre: nombres.get(r.user_id) ?? "Vendedor" })));
      }
      setLoading(false);
    };
    cargar();
    return () => { cancelled = true; };
  }, [user, isAdmin, filtros.periodo]);

  const ciudades = useMemo(() => Array.from(new Set(clientes.map((c) => c.ciudad).filter(Boolean) as string[])).sort(), [clientes]);

  const clientesFiltrados = useMemo(() => clientes.filter((c) => {
    if (filtros.ciudad !== "todas" && c.ciudad !== filtros.ciudad) return false;
    if (esVendedor && c.vendedor_id !== user?.id) return false;
    if (isAdmin && filtros.vendedorId !== "todos" && c.vendedor_id !== filtros.vendedorId) return false;
    return true;
  }), [clientes, filtros.ciudad, filtros.vendedorId, esVendedor, isAdmin, user?.id]);

  const clienteIds = useMemo(() => new Set(clientesFiltrados.map((c) => c.id)), [clientesFiltrados]);
  const pedidosFiltrados = useMemo(() => pedidos.filter((p) => {
    if (!clienteIds.has(p.cliente_id)) return false;
    if (esVendedor && p.vendedor_id !== user?.id) return false;
    if (isAdmin && filtros.vendedorId !== "todos" && p.vendedor_id !== filtros.vendedorId) return false;
    return true;
  }), [pedidos, clienteIds, filtros.vendedorId, esVendedor, isAdmin, user?.id]);

  const ventas = pedidosFiltrados.reduce((s, p) => s + Number(p.total || 0), 0);
  const ticket = pedidosFiltrados.length ? ventas / pedidosFiltrados.length : 0;
  const activos = clientesFiltrados.filter((c) => c.activo).length;
  const gps = clientesFiltrados.filter((c) => c.latitud != null && c.longitud != null).length;

  const ranking = useMemo<RankingRow[]>(() => {
    const nombres = new Map(vendedores.map((v) => [v.id, v.nombre]));
    const mapa = new Map<string, RankingRow>();
    pedidosFiltrados.forEach((p) => {
      if (!p.vendedor_id) return;
      const row = mapa.get(p.vendedor_id) ?? { vendedorId: p.vendedor_id, nombre: nombres.get(p.vendedor_id) ?? "Vendedor", total: 0, pedidos: 0 };
      row.total += Number(p.total || 0);
      row.pedidos += 1;
      mapa.set(p.vendedor_id, row);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [pedidosFiltrados, vendedores]);

  const ventasCiudad = useMemo(() => {
    const ciudadPorCliente = new Map(clientes.map((c) => [c.id, c.ciudad || "Sin ciudad"]));
    const mapa = new Map<string, number>();
    pedidosFiltrados.forEach((p) => {
      const ciudad = ciudadPorCliente.get(p.cliente_id) ?? "Sin ciudad";
      mapa.set(ciudad, (mapa.get(ciudad) ?? 0) + Number(p.total || 0));
    });
    return [...mapa.entries()].map(([ciudad, total]) => ({ ciudad, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [clientes, pedidosFiltrados]);

  const serie = useMemo(() => {
    const mapa = new Map<string, { mes: string; total: number; pedidos: number }>();
    pedidosFiltrados.forEach((p) => {
      const d = new Date(p.created_at);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = mapa.get(mes) ?? { mes, total: 0, pedidos: 0 };
      row.total += Number(p.total || 0); row.pedidos += 1; mapa.set(mes, row);
    });
    return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [pedidosFiltrados]);

  const oportunidades = useMemo(() => {
    const ultimaCompra = new Map<string, number>();
    pedidosFiltrados.forEach((p) => ultimaCompra.set(p.cliente_id, Math.max(ultimaCompra.get(p.cliente_id) ?? 0, new Date(p.created_at).getTime())));
    const limite = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return clientesFiltrados.filter((c) => c.activo && (ultimaCompra.get(c.id) ?? 0) < limite).slice(0, 5);
  }, [clientesFiltrados, pedidosFiltrados]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando inteligencia comercial…</div>;
  if (error) return <Card><CardContent className="pt-6 text-sm text-destructive">No se pudo cargar el dashboard comercial: {error}</CardContent></Card>;

  return <div className="space-y-4">
    <Card><CardContent className="pt-4"><div className="flex flex-wrap gap-3 items-center">
      <div className="font-semibold mr-auto">Inteligencia comercial</div>
      <Select value={filtros.periodo} onValueChange={(v: any) => setFiltros((f) => ({ ...f, periodo: v }))}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{DASHBOARD_PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select>
      <Select value={filtros.ciudad} onValueChange={(v) => setFiltros((f) => ({ ...f, ciudad: v }))}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Ciudad / zona" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas las ciudades</SelectItem>{ciudades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      {isAdmin && <Select value={filtros.vendedorId} onValueChange={(v) => setFiltros((f) => ({ ...f, vendedorId: v }))}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Vendedor" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los vendedores</SelectItem>{vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent></Select>}
    </div></CardContent></Card>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon={BarChart3} label="Ventas" value={bs(ventas)} />
      <Kpi icon={ShoppingCart} label="Pedidos" value={String(pedidosFiltrados.length)} />
      <Kpi icon={Package} label="Ticket promedio" value={bs(ticket)} />
      <Kpi icon={Users} label="Clientes activos" value={String(activos)} />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2"><CardHeader><CardTitle className="text-base">Evolución de ventas</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={serie}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mes" tickFormatter={mesLabel} fontSize={10}/><YAxis fontSize={10}/><Tooltip formatter={(v: number) => bs(v)} labelFormatter={mesLabel}/><Line dataKey="total" type="monotone" stroke="currentColor" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2 items-center"><MapPin className="h-4 w-4"/> Cobertura GPS</CardTitle></CardHeader><CardContent><p className="industrial-title text-3xl">{gps}</p><p className="text-sm text-muted-foreground">de {clientesFiltrados.length} clientes con ubicación disponible</p><div className="mt-4 space-y-1 text-sm">{ventasCiudad.slice(0,5).map((z) => <div key={z.ciudad} className="flex justify-between gap-3"><span className="truncate">{z.ciudad}</span><strong>{bs(z.total)}</strong></div>)}</div></CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle className="text-base">Ventas por ciudad / zona</CardTitle></CardHeader><CardContent><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={ventasCiudad} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" fontSize={10}/><YAxis type="category" dataKey="ciudad" width={100} fontSize={10}/><Tooltip formatter={(v: number) => bs(v)}/><Bar dataKey="total" fill="currentColor" radius={[0,3,3,0]}/></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4"/> Ranking vendedores</CardTitle></CardHeader><CardContent className="space-y-2">{ranking.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos en el período.</p> : ranking.map((r,i) => <div key={r.vendedorId} className="flex items-center gap-3 border-b last:border-0 pb-2"><span className="font-bold w-5">{i+1}</span><span className="flex-1 truncate">{r.nombre}</span><span className="text-xs text-muted-foreground">{r.pedidos} ped.</span><strong>{bs(r.total)}</strong></div>)}</CardContent></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card><CardHeader><CardTitle className="text-base">Top clientes</CardTitle></CardHeader><CardContent className="space-y-2">{(reporte?.top_clientes ?? []).slice(0,5).map((c,i) => <div key={c.cliente_id} className="flex gap-2 text-sm"><span>{i+1}</span><Link className="flex-1 truncate hover:underline" to={`/app/admin/clientes?focus=${c.cliente_id}`}>{c.empresa}</Link><strong>{bs(c.total)}</strong></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Top productos</CardTitle></CardHeader><CardContent className="space-y-2">{(reporte?.top_productos ?? []).slice(0,5).map((p,i) => <div key={p.producto_id} className="flex gap-2 text-sm"><span>{i+1}</span><span className="flex-1 truncate">{p.nombre}</span><span className="text-muted-foreground">{p.cantidad} u.</span></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Oportunidades</CardTitle></CardHeader><CardContent className="space-y-2">{oportunidades.length === 0 ? <p className="text-sm text-muted-foreground">Sin alertas de inactividad en este filtro.</p> : oportunidades.map((c) => <div key={c.id} className="border-b last:border-0 pb-2"><Link className="text-sm font-medium hover:underline" to={isAdmin ? `/app/admin/clientes?focus=${c.id}` : "/app/clientes"}>{c.empresa}</Link><p className="text-xs text-muted-foreground">Cliente activo sin compra reciente en el período analizado.</p></div>)}</CardContent></Card>
    </div>
  </div>;
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <Card><CardContent className="pt-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/><span className="text-xs uppercase tracking-wide">{label}</span></div><p className="industrial-title text-2xl mt-2">{value}</p></CardContent></Card>;
}
