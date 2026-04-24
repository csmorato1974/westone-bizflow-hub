import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Loader2 } from "lucide-react";

interface Pedido {
  id: string; numero: number; estado: string; total: number; created_at: string;
  pedido_items: { cantidad: number; precio_unitario: number; productos: { nombre: string } | null }[];
}

export default function ClienteMisPedidos() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("pedidos")
        .select("id,numero,estado,total,created_at,pedido_items(cantidad,precio_unitario,productos(nombre))")
        .order("created_at", { ascending: false });
      setPedidos((data as any) ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-3xl">Mis Pedidos</h1>
        <p className="text-sm text-muted-foreground">Historial y estado de tus pedidos</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : pedidos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No has realizado pedidos aún</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {pedidos.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="industrial-title text-lg">Pedido #{p.numero}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <EstadoBadge estado={p.estado} />
                    <span className="industrial-title text-lg">Bs {Number(p.total).toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t pt-2 text-sm space-y-1">
                  {p.pedido_items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{it.cantidad}× {it.productos?.nombre}</span>
                      <span className="text-muted-foreground">Bs {(it.cantidad * Number(it.precio_unitario)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
