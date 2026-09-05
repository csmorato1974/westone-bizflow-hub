import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "@/components/EstadoBadge";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Pedido { id: string; numero: number; estado: string; total: number; created_at: string; origen: string; clientes: { empresa: string } | null; }

export default function VendedorPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("pedidos").select("id,numero,estado,total,created_at,origen,clientes(empresa)").order("created_at", { ascending: false });
    setPedidos((data as unknown as Pedido[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const cambiarEstado = async (pedido: Pedido, estado: "aprobado" | "cancelado") => {
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", pedido.id);
    if (error) {
      toast.error(error.message.includes("Stock insuficiente") ? "No hay stock suficiente para confirmar este pedido." : error.message);
      return;
    }
    toast.success(estado === "aprobado" ? "Pedido confirmado y stock reservado" : "Solicitud cancelada");
    await load();
  };

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
                  {p.origen === "portal" && <span className="text-xs font-medium text-brand">Solicitud del portal</span>}
                </div>
                <div className="flex items-center gap-3">
                  <EstadoBadge estado={p.estado} />
                  <span className="industrial-title text-lg">Bs {Number(p.total).toFixed(2)}</span>
                  {p.estado === "enviado" && (
                    <>
                      <Button size="sm" onClick={() => cambiarEstado(p, "aprobado")}><CheckCircle2 className="h-4 w-4" /> Confirmar</Button>
                      <Button size="sm" variant="outline" onClick={() => cambiarEstado(p, "cancelado")}><XCircle className="h-4 w-4" /> Cancelar</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
