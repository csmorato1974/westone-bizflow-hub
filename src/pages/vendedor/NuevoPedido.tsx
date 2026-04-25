import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { productImageUrl } from "@/lib/productImage";

interface Variante { id: string; presentacion: string; precio: number; stock: number; }
interface Producto { id: string; nombre: string; sku: string; imagen_url: string | null; variantes: Variante[]; }
interface CartItem { variante_id: string; producto_id: string; nombre: string; presentacion: string; precio: number; cantidad: number; }

export default function NuevoPedido() {
  const { clienteId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<{ empresa: string; contacto: string; celular: string; vendedor_id: string | null; lista_precio_id: string | null } | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedVar, setSelectedVar] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!clienteId) return;
      const { data: c } = await supabase.from("clientes").select("empresa,contacto,celular,vendedor_id,lista_precio_id").eq("id", clienteId).single();
      if (!c) { toast.error("Cliente no encontrado"); navigate(-1); return; }
      setCliente(c);
      if (!c.lista_precio_id) { toast.error("Cliente sin lista de precios asignada"); setLoading(false); return; }
      const { data: items } = await supabase
        .from("lista_precio_variante_items")
        .select("precio, producto_variantes!inner(id,presentacion,activa,producto_id,variante_stock(cantidad),productos!inner(id,nombre,sku,activo,imagen_url))")
        .eq("lista_id", c.lista_precio_id);

      const map = new Map<string, Producto>();
      (items ?? []).forEach((row: any) => {
        const v = row.producto_variantes;
        const p = v?.productos;
        if (!v || !p || !p.activo || !v.activa) return;
        if (!map.has(p.id)) map.set(p.id, { id: p.id, nombre: p.nombre, sku: p.sku, imagen_url: p.imagen_url ?? null, variantes: [] });
        const stockArr = Array.isArray(v.variante_stock) ? v.variante_stock : [];
        map.get(p.id)!.variantes.push({
          id: v.id, presentacion: v.presentacion, precio: Number(row.precio),
          stock: stockArr[0]?.cantidad ?? 0,
        });
      });
      const list = Array.from(map.values())
        .map((p) => ({ ...p, variantes: p.variantes.sort((a, b) => a.presentacion.localeCompare(b.presentacion)) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      setProductos(list);
      setSelectedVar(Object.fromEntries(list.map((p) => [p.id, (p.variantes.find((v) => v.stock > 0) ?? p.variantes[0])?.id ?? ""])));
      setLoading(false);
    })();
  }, [clienteId, navigate]);

  const addByVariante = (p: Producto, v: Variante) => {
    setCart((prev) => {
      const ex = prev.find((x) => x.variante_id === v.id);
      if (ex) return prev.map((x) => x.variante_id === v.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      return [...prev, { variante_id: v.id, producto_id: p.id, nombre: p.nombre, presentacion: v.presentacion, precio: v.precio, cantidad: 1 }];
    });
  };
  const dec = (varId: string) => setCart((prev) => prev.flatMap((x) => x.variante_id === varId ? (x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : []) : [x]));
  const rm = (varId: string) => setCart((prev) => prev.filter((x) => x.variante_id !== varId));

  const total = cart.reduce((s, x) => s + x.cantidad * x.precio, 0);

  const filtered = productos.filter((p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  const onSubmit = async () => {
    if (!user || !clienteId || !cliente) return;
    if (cart.length === 0) return toast.error("Agrega al menos un producto");
    setSaving(true);
    const { data: pedido, error } = await supabase.from("pedidos").insert({
      cliente_id: clienteId,
      vendedor_id: cliente.vendedor_id,
      creado_por: user.id,
      estado: "enviado",
      total,
      notas: notas.trim() || null,
    }).select().single();
    if (error || !pedido) { setSaving(false); toast.error(error?.message ?? "Error"); return; }
    const { error: e2 } = await supabase.from("pedido_items").insert(
      cart.map((c) => ({
        pedido_id: pedido.id,
        producto_id: c.producto_id,
        variante_id: c.variante_id,
        presentacion: c.presentacion,
        cantidad: c.cantidad,
        precio_unitario: c.precio,
      }))
    );
    if (e2) { setSaving(false); toast.error(e2.message); return; }

    const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    if (admins && admins.length > 0) {
      await supabase.from("notificaciones").insert(admins.map((a) => ({
        user_id: a.user_id,
        titulo: "Nuevo pedido",
        mensaje: `Pedido #${pedido.numero} de ${cliente.empresa} por Bs ${total.toFixed(2)}`,
        tipo: "pedido",
        link: `/app/admin/pedidos`,
      })));
    }

    await logAudit("crear_pedido", "pedidos", pedido.id, { numero: pedido.numero, total, cliente_id: clienteId });
    setSaving(false);
    toast.success(`Pedido #${pedido.numero} enviado`);
    navigate("/app/pedidos");
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="industrial-title text-2xl">Nuevo pedido — {cliente?.empresa}</h1>
        <p className="text-sm text-muted-foreground">Catálogo según lista de precios autorizada</p>
      </div>
      <Input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-2">
          {filtered.map((p) => {
            const sel = selectedVar[p.id] ?? p.variantes[0]?.id ?? "";
            const v = p.variantes.find((x) => x.id === sel) ?? p.variantes[0];
            return (
              <Card key={p.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                      {p.imagen_url ? (
                        <img src={productImageUrl(p.imagen_url)!} alt={p.nombre} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                  </div>
                  {p.variantes.length > 0 ? (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground">Presentación</Label>
                        <Select value={sel} onValueChange={(val) => setSelectedVar((s) => ({ ...s, [p.id]: val }))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {p.variantes.map((vv) => (
                              <SelectItem key={vv.id} value={vv.id}>
                                {vv.presentacion} — Bs {vv.precio.toFixed(2)} (stock {vv.stock})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" onClick={() => v && addByVariante(p, v)} disabled={!v} className="bg-brand text-brand-foreground hover:bg-brand-dark"><Plus className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin presentaciones disponibles.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit sticky top-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="industrial-title">Pedido</h3>
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Sin productos</p>}
            {cart.map((c) => (
              <div key={c.variante_id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">{c.presentacion} · Bs {c.precio.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(c.variante_id)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center">{c.cantidad}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => {
                    const p = productos.find((x) => x.id === c.producto_id);
                    const v = p?.variantes.find((x) => x.id === c.variante_id);
                    if (p && v) addByVariante(p, v);
                  }}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rm(c.variante_id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            <div>
              <Label>Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} />
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="industrial-title text-xl">Bs {total.toFixed(2)}</span>
            </div>
            <Button onClick={onSubmit} disabled={saving || cart.length === 0} className="w-full bg-primary text-brand hover:bg-primary/90 font-semibold uppercase">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar pedido"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
