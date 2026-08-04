import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  bs,
  fechaCorta,
  mesLabel,
  serieUltimosMeses,
  type ClienteEstadisticas as Stats,
} from "@/lib/reportes";

/** Sección "Actividad y estadísticas" de la ficha de un cliente (solo lectura). */
export function ClienteEstadisticas({ clienteId }: { clienteId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .rpc("cliente_estadisticas", { _cliente: clienteId })
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) setError(e.message);
        else setStats(data as unknown as Stats);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  const serie = serieUltimosMeses(stats?.por_mes ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="industrial-title text-lg flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand" /> Actividad y estadísticas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las estadísticas: {error}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Metric label="Total gastado" value={bs(stats?.total_gastado)} />
              <Metric label="Pedidos" value={String(stats?.pedidos ?? 0)} />
              <Metric label="Ticket promedio" value={bs(stats?.ticket_promedio)} />
              <Metric label="Primera compra" value={fechaCorta(stats?.primera_compra)} />
              <Metric label="Última compra" value={fechaCorta(stats?.ultima_compra)} />
              <Metric
                label="Producto más comprado"
                value={
                  stats?.producto_top
                    ? `${stats.producto_top.nombre} (${stats.producto_top.cantidad})`
                    : "—"
                }
              />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Compras por mes (últimos 12 meses)</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={mesLabel} fontSize={10} interval={0} />
                    <YAxis fontSize={10} width={48} />
                    <Tooltip
                      formatter={(v: number) => bs(v)}
                      labelFormatter={(l: string) => mesLabel(l)}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" className="fill-brand" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm break-words">{value}</p>
    </div>
  );
}
