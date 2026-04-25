import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Loader2, MessageCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fillTemplate, waLink } from "@/lib/whatsapp";

const ESTADOS = ["borrador", "enviado", "aprobado", "listo_despacho", "en_ruta", "entregado", "cancelado"];

interface Pedido {
  id: string; numero: number; estado: string; total: number; created_at: string;
  clientes: { empresa: string; contacto: string; celular: string; direccion: string | null } | null;
  pedido_items: { cantidad: number; presentacion: string | null; productos: { nombre: string } | null }[];
}

export default function AdminPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>("all");
  const [tplDespacho, setTplDespacho] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: t }] = await Promise.all([
      supabase.from("pedidos")
        .select("id,numero,estado,total,created_at,clientes(empresa,contacto,celular,direccion),pedido_items!pedido_items_pedido_id_fkey(cantidad,presentacion,productos(nombre))")
        .order("created_at", { ascending: false }),
      supabase.from("whatsapp_templates").select("mensaje").eq("clave", "listo_despacho").maybeSingle(),
    ]);
    setPedidos((data as any) ?? []);
    setTplDespacho(t?.mensaje ?? "");
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setEstado = async (p: Pedido, estado: string) => {
    const { error } = await supabase.from("pedidos").update({ estado: estado as any }).eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAudit("cambio_estado", "pedidos", p.id, { estado });
    if (estado === "listo_despacho") {
      const { data: logs } = await supabase.from("user_roles").select("user_id").eq("role", "logistica");
      if (logs) await supabase.from("notificaciones").insert(logs.map((l) => ({
        user_id: l.user_id, titulo: "Pedido listo", mensaje: `Pedido #${p.numero} listo para despacho`, tipo: "logistica", link: "/app/logistica",
      })));
    }
    toast.success("Estado actualizado"); load();
  };

  const visible = pedidos.filter((p) => filtro === "all" || p.estado === filtro);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="industrial-title text-3xl">Pedidos</h1></div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          {visible.map((p) => {
            const msg = fillTemplate(tplDespacho, { numero: p.numero, empresa: p.clientes?.empresa, direccion: p.clientes?.direccion ?? "", contacto: p.clientes?.contacto, celular: p.clientes?.celular });
            return (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="industrial-title text-lg">#{p.numero} — {p.clientes?.empresa}</p>
                      <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.clientes?.celular}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EstadoBadge estado={p.estado} />
                      <span className="industrial-title">Bs {Number(p.total).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-sm bg-muted rounded p-2 space-y-1 max-h-32 overflow-y-auto">
                    {p.pedido_items?.map((it, i) => <div key={i}>{it.cantidad}× {it.productos?.nombre}{it.presentacion && <span className="text-muted-foreground"> ({it.presentacion})</span>}</div>)}
                  </div>
                  <div className="flex gap-2 pt-2 border-t flex-wrap items-center">
                    <Select value={p.estado} onValueChange={(v) => setEstado(p, v)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                    {p.clientes?.celular && (
                      <Button asChild size="sm" variant="outline"><a href={waLink(p.clientes.celular, msg)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3 w-3" /> WhatsApp</a></Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
