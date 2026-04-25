import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Loader2, MapPin, MessageCircle, Phone, Truck, Package } from "lucide-react";
import { mapsLink, waLink, fillTemplate } from "@/lib/whatsapp";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Pedido {
  id: string; numero: number; estado: string; total: number; notas: string | null; created_at: string;
  clientes: { empresa: string; contacto: string; celular: string; direccion: string | null; latitud: number | null; longitud: number | null } | null;
  pedido_items: { cantidad: number; presentacion: string | null; productos: { nombre: string; sku: string } | null }[];
}

export default function Logistica() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: t }] = await Promise.all([
      supabase.from("pedidos")
        .select("id,numero,estado,total,notas,created_at,clientes(empresa,contacto,celular,direccion,latitud,longitud),pedido_items(cantidad,presentacion,productos(nombre,sku))")
        .in("estado", ["listo_despacho", "en_ruta"])
        .order("created_at", { ascending: true }),
      supabase.from("whatsapp_templates").select("mensaje").eq("clave", "en_ruta").maybeSingle(),
    ]);
    setPedidos((data as any) ?? []);
    setTpl(t?.mensaje ?? "");
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setEstado = async (id: string, numero: number, estado: "en_ruta" | "entregado") => {
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("cambio_estado_logistica", "pedidos", id, { estado });
    toast.success(`Pedido #${numero} → ${estado}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-3xl flex items-center gap-2"><Truck className="h-7 w-7 text-brand" /> Despachos</h1>
        <p className="text-sm text-muted-foreground">Pedidos listos para despacho y en ruta</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : pedidos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin pedidos pendientes de despacho</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pedidos.map((p) => {
            const c = p.clientes;
            const maps = mapsLink(c?.latitud, c?.longitud);
            const msg = fillTemplate(tpl, { numero: p.numero });
            return (
              <Card key={p.id} className="border-l-4 border-l-brand">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="industrial-title text-lg">Pedido #{p.numero}</p>
                    <EstadoBadge estado={p.estado} />
                  </div>
                  {c && <div className="text-sm space-y-1">
                    <p className="font-semibold">{c.empresa}</p>
                    <p className="text-muted-foreground">{c.contacto} · {c.celular}</p>
                    {c.direccion && <p className="text-xs">📍 {c.direccion}</p>}
                  </div>}
                  <div className="text-sm bg-muted rounded p-2 space-y-1 max-h-32 overflow-y-auto">
                    {p.pedido_items?.map((it, i) => (
                      <div key={i} className="flex justify-between"><span>{it.cantidad}× {it.productos?.nombre}{it.presentacion && <span className="text-muted-foreground"> ({it.presentacion})</span>}</span><span className="text-xs text-muted-foreground">{it.productos?.sku}</span></div>
                    ))}
                  </div>
                  {p.notas && <p className="text-xs italic text-muted-foreground">Notas: {p.notas}</p>}
                  <div className="flex gap-2 flex-wrap">
                    {c?.celular && <Button asChild size="sm" variant="outline"><a href={`tel:${c.celular}`}><Phone className="h-3 w-3" /> Llamar</a></Button>}
                    {c?.celular && <Button asChild size="sm" variant="outline"><a href={waLink(c.celular, msg)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3 w-3" /> WhatsApp</a></Button>}
                    {maps && <Button asChild size="sm" variant="outline"><a href={maps} target="_blank" rel="noopener noreferrer"><MapPin className="h-3 w-3" /> Maps</a></Button>}
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    {p.estado === "listo_despacho" && (
                      <Button size="sm" onClick={() => setEstado(p.id, p.numero, "en_ruta")} className="flex-1 bg-info text-info-foreground hover:bg-info/90"><Truck className="h-4 w-4" /> Marcar en ruta</Button>
                    )}
                    {p.estado === "en_ruta" && (
                      <Button size="sm" onClick={() => setEstado(p.id, p.numero, "entregado")} className="flex-1 bg-success text-success-foreground hover:bg-success/90"><Package className="h-4 w-4" /> Marcar entregado</Button>
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
