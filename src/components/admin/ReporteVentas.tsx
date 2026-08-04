import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Loader2, Package, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bs, mesLabel, type ReporteVentas as Reporte } from "@/lib/reportes";

const RANGOS = [
  { key: "todo", label: "Todo" },
  { key: "12m", label: "12 meses" },
  { key: "90d", label: "90 días" },
  { key: "30d", label: "30 días" },
] as const;

type RangoKey = (typeof RANGOS)[number]["key"];

const desdeDe = (r: RangoKey): string | null => {
  const now = new Date();
  if (r === "todo") return null;
  const d = new Date(now);
  if (r === "12m") d.setMonth(d.getMonth() - 12);
  if (r === "90d") d.setDate(d.getDate() - 90);
  if (r === "30d") d.setDate(d.getDate() - 30);
  return d.toISOString();
};

/** Reportes agregados de ventas para administradores. Solo lectura. */
export function ReporteVentas() {
  const [rango, setRango] = useState<RangoKey>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aplicado, setAplicado] = useState<{ desde: string | null; hasta: string | null }>({
    desde: null,
    hasta: null,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .rpc("reporte_ventas", { _desde: aplicado.desde, _hasta: aplicado.hasta })
      .then(({ data: d, error: e }) => {
        if (cancelled) return;
        if (e) setError(e.message);
        else setData(d as unknown as Reporte);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aplicado]);

  const serie = useMemo(() => data?.por_mes ?? [], [data]);
  const estado = data?.clientes_estado;

  const aplicarRango = (r: RangoKey) => {
    setRango(r);
    setDesde("");
    setHasta("");
    setAplicado({ desde: desdeDe(r), hasta: null });
  };

  const aplicarPersonalizado = () => {
    if (!desde && !hasta) return;
    setRango("todo");
    setAplicado({
      desde: desde ? new Date(`${desde}T00:00:00`).toISOString() : null,
      hasta: hasta ? new Date(`${hasta}T23:59:59`).toISOString() : null,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="industrial-title text-lg flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" /> Reportes de ventas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex rounded-md border p-0.5">
              {RANGOS.map((r) => (
                <Button
                  key={r.key}
                  size="sm"
                  variant={rango === r.key && !desde && !hasta ? "default" : "ghost"}
                  onClick={() => aplicarRango(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9" />
              </div>
              <Button size="sm" variant="outline" onClick={aplicarPersonalizado} disabled={!desde && !hasta}>
                Aplicar
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando reportes…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">No se pudieron cargar los reportes: {error}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KPI label="Ventas totales" value={bs(data?.ventas_total)} />
                <KPI label="Pedidos" value={String(data?.pedidos_total ?? 0)} />
                <KPI label="Ticket promedio" value={bs(data?.ticket_promedio)} />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Ventas por mes</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="mes" tickFormatter={mesLabel} fontSize={10} />
                      <YAxis fontSize={10} width={56} />
                      <Tooltip
                        formatter={(v: number) => bs(v)}
                        labelFormatter={(l: string) => mesLabel(l)}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="total" className="stroke-brand" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="industrial-title text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-brand" /> Top 10 clientes por monto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(data?.top_clientes ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>
              )}
              {(data?.top_clientes ?? []).map((c, i) => (
                <div key={c.cliente_id} className="flex items-center gap-2 text-sm border-b last:border-0 py-1">
                  <span className="text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                  <Link
                    to={`/app/admin/clientes?focus=${c.cliente_id}`}
                    className="flex-1 truncate text-brand hover:underline"
                  >
                    {c.empresa}
                  </Link>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{c.pedidos} ped.</span>
                  <span className="font-semibold whitespace-nowrap">{bs(c.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="industrial-title text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-brand" /> Top 10 productos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(data?.top_productos ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>
              )}
              {(data?.top_productos ?? []).map((p, i) => (
                <div key={p.producto_id} className="flex items-center gap-2 text-sm border-b last:border-0 py-1">
                  <span className="text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{p.cantidad} u.</span>
                  <span className="font-semibold whitespace-nowrap">{bs(p.monto)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="industrial-title text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand" /> Clientes por estado
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="outline">Total: {estado?.total ?? 0}</Badge>
              <Badge variant="outline" className="border-success text-success">Activos: {estado?.activos ?? 0}</Badge>
              <Badge variant="outline" className="border-destructive text-destructive">Inactivos: {estado?.inactivos ?? 0}</Badge>
              <Badge variant="outline" className="border-info text-info">Provisionales: {estado?.provisionales ?? 0}</Badge>
              <Badge variant="outline" className="border-warning text-warning">Incompletos: {estado?.incompletos ?? 0}</Badge>
              <Badge variant="outline">Sin cuenta: {estado?.sin_cuenta ?? 0}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="industrial-title text-base">Clientes por ciudad / zona</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.clientes_por_ciudad ?? []} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" fontSize={10} />
                    <YAxis type="category" dataKey="ciudad" fontSize={10} width={96} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="clientes" className="fill-brand" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="industrial-title text-xl">{value}</p>
    </div>
  );
}
