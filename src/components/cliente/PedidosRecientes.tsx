import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Loader2, Package, ExternalLink } from "lucide-react";

interface Item {
  cantidad: number;
  precio_unitario: number;
  presentacion: string | null;
  subtotal: number | null;
  productos: { nombre: string; sku: string | null } | null;
}
interface Pedido {
  id: string;
  numero: number;
  estado: string;
  total: number;
  created_at: string;
  pedido_items: Item[];
}

export function PedidosRecientes({ clienteId, limit = 5, hideViewAll = false, title = "Mis pedidos recientes" }: { clienteId: string; limit?: number; hideViewAll?: boolean; title?: string }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id,numero,estado,total,created_at,pedido_items(cantidad,precio_unitario,presentacion,subtotal,productos(nombre,sku))")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) console.error("[PedidosRecientes] error:", error);
    setPedidos((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`perfil-pedidos-${clienteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `cliente_id=eq.${clienteId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="industrial-title text-lg flex items-center gap-2">
          <Package className="h-4 w-4 text-brand" />
          Mis pedidos recientes
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/mis-pedidos"><ExternalLink className="h-3 w-3 mr-1" /> Ver todos</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes pedidos.</p>
        ) : (
          pedidos.map((p) => {
            const isOpen = openId === p.id;
            const items = p.pedido_items ?? [];
            return (
              <Collapsible key={p.id} open={isOpen} onOpenChange={(o) => setOpenId(o ? p.id : null)}>
                <div className="border rounded-md">
                  <CollapsibleTrigger className="w-full p-3 flex items-center justify-between gap-2 hover:bg-muted/40 text-left">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="industrial-title">#{p.numero}</span>
                      <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                      <EstadoBadge estado={p.estado} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="industrial-title text-sm">Bs {Number(p.total).toFixed(2)}</span>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-1 border-t text-sm space-y-1">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin ítems.</p>
                      ) : items.map((it, idx) => {
                        const sub = Number(it.subtotal ?? Number(it.cantidad) * Number(it.precio_unitario));
                        return (
                          <div key={idx} className="flex justify-between gap-2">
                            <span>
                              {it.cantidad}× {it.productos?.nombre ?? "—"}
                              {it.presentacion && <span className="text-muted-foreground"> ({it.presentacion})</span>}
                              {it.productos?.sku && <span className="text-xs text-muted-foreground"> · SKU {it.productos.sku}</span>}
                            </span>
                            <span className="text-muted-foreground whitespace-nowrap">Bs {sub.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
