import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Loader2 } from "lucide-react";

interface Pedido { id: string; numero: number; estado: string; total: number; created_at: string; clientes: { empresa: string } | null; }

export default function VendedorPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("pedidos").select("id,numero,estado,total,created_at,clientes(empresa)").order("created_at", { ascending: false });
      setPedidos((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-3xl">Mis Pedidos</h1>
        <p className="text-sm text-muted-foreground">Historial de pedidos generados</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : pedidos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin pedidos aún</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {pedidos.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="industrial-title text-lg">#{p.numero}</p>
                  <p className="text-sm">{p.clientes?.empresa ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <EstadoBadge estado={p.estado} />
                  <span className="industrial-title text-lg">Bs {Number(p.total).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
