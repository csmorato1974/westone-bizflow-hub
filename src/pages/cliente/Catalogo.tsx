import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Minus, Trash2, ShoppingCart, Info } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Producto { id: string; nombre: string; sku: string; descripcion: string | null; ficha_tecnica: any; presentaciones: string[] | null; linea: string; precio: number; stock: number; imagen_url: string | null; }
interface CartItem { producto_id: string; nombre: string; precio: number; cantidad: number; max: number; }

const LINEA_LABEL: Record<string, string> = {
  refrigerante: "Refrigerantes",
  anticongelante: "Anticongelantes",
  heavy_duty: "Heavy Duty",
  def: "DEF",
  limpieza: "Limpieza",
};

export default function ClienteCatalogo() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cliente, setCliente] = useState<{ id: string; lista_precio_id: string | null } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [linea, setLinea] = useState<string>("all");
  const [info, setInfo] = useState<Producto | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: c } = await supabase.from("clientes").select("id,lista_precio_id").eq("user_id", user.id).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCliente(c);
      if (!c.lista_precio_id) { setLoading(false); return; }
      const { data: items } = await supabase
        .from("lista_precio_items")
        .select("precio, productos!inner(id,nombre,sku,descripcion,ficha_tecnica,presentaciones,linea,activo,imagen_url,stock(cantidad))")
        .eq("lista_id", c.lista_precio_id);
      const activos = (items ?? []).filter((i: any) => i.productos?.activo);
      // Fallback: si el embed de stock viene vacío, consultamos stock por separado
      const ids = activos.map((i: any) => i.productos.id);
      let stockMap: Record<string, number> = {};
      if (ids.length) {
        const { data: stockRows } = await supabase.from("stock").select("producto_id,cantidad").in("producto_id", ids);
        stockMap = Object.fromEntries((stockRows ?? []).map((s: any) => [s.producto_id, s.cantidad]));
      }
      const prods: Producto[] = activos.map((i: any) => {
        const embedStock = Array.isArray(i.productos.stock) && i.productos.stock[0] ? i.productos.stock[0].cantidad : null;
        return {
          id: i.productos.id, nombre: i.productos.nombre, sku: i.productos.sku,
          descripcion: i.productos.descripcion, ficha_tecnica: i.productos.ficha_tecnica,
          presentaciones: i.productos.presentaciones, linea: i.productos.linea,
          imagen_url: i.productos.imagen_url ?? null,
          precio: Number(i.precio),
          stock: embedStock ?? stockMap[i.productos.id] ?? 0,
        };
      });
      setProductos(prods);
      setLoading(false);
    })();
  }, [user]);

  const filtered = productos.filter((p) => (linea === "all" || p.linea === linea) && (p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())));
  const lineas = Array.from(new Set(productos.map((p) => p.linea)));

  const add = (p: Producto) => {
    if (p.stock <= 0) return toast.error("Sin stock");
    setCart((prev) => {
      const ex = prev.find((x) => x.producto_id === p.id);
      if (ex) {
        if (ex.cantidad >= ex.max) { toast.error("Stock insuficiente"); return prev; }
        return prev.map((x) => x.producto_id === p.id ? { ...x, cantidad: x.cantidad + 1 } : x);
      }
      return [...prev, { producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, max: p.stock }];
    });
  };
  const dec = (id: string) => setCart((prev) => prev.flatMap((x) => x.producto_id === id ? (x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : []) : [x]));
  const rm = (id: string) => setCart((prev) => prev.filter((x) => x.producto_id !== id));
  const total = cart.reduce((s, x) => s + x.cantidad * x.precio, 0);

  const submit = async () => {
    if (!user || !cliente) return;
    if (cart.length === 0) return toast.error("Carrito vacío");
    setSaving(true);
    const { data: pedido, error } = await supabase.from("pedidos").insert({
      cliente_id: cliente.id, creado_por: user.id, estado: "enviado", total,
      notas: notas.trim() || null,
    }).select().single();
    if (error || !pedido) { setSaving(false); toast.error(error?.message ?? "Error"); return; }
    const { error: e2 } = await supabase.from("pedido_items").insert(
      cart.map((c) => ({ pedido_id: pedido.id, producto_id: c.producto_id, cantidad: c.cantidad, precio_unitario: c.precio }))
    );
    if (e2) { setSaving(false); toast.error(e2.message); return; }
    const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    if (admins) await supabase.from("notificaciones").insert(admins.map((a) => ({
      user_id: a.user_id, titulo: "Nuevo pedido cliente",
      mensaje: `Pedido #${pedido.numero} por Bs ${total.toFixed(2)}`, tipo: "pedido", link: "/app/admin/pedidos",
    })));
    await logAudit("crear_pedido_cliente", "pedidos", pedido.id, { numero: pedido.numero, total });
    setSaving(false);
    setCart([]); setNotas("");
    toast.success(`Pedido #${pedido.numero} enviado`);
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if (!cliente) return (
    <Card>
      <CardContent className="p-8 text-center space-y-3">
        <h2 className="industrial-title text-xl">Cuenta no vinculada</h2>
        <p className="text-sm text-muted-foreground">
          Tu usuario aún no está enlazado a una ficha de cliente. Pídele a tu vendedor o al administrador que vincule la siguiente cuenta a tu empresa:
        </p>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded inline-block">{user?.email}</p>
        <p className="text-xs text-muted-foreground">
          (Admin → Clientes → seleccionar tu empresa → "Usuario portal cliente")
        </p>
      </CardContent>
    </Card>
  );
  if (!cliente.lista_precio_id) return <Card><CardContent className="p-8 text-center text-muted-foreground">No tienes una lista de precios asignada. Contacta a tu vendedor.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="industrial-title text-3xl">Catálogo Westone</h1>
          <p className="text-sm text-muted-foreground">Productos y precios autorizados</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Button variant={linea === "all" ? "default" : "outline"} size="sm" onClick={() => setLinea("all")}>Todos</Button>
        {lineas.map((l) => (
          <Button key={l} variant={linea === l ? "default" : "outline"} size="sm" onClick={() => setLinea(l)}>{LINEA_LABEL[l] ?? l}</Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-3 sm:grid-cols-2 max-h-[65vh] overflow-y-auto pr-2">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:border-brand transition-colors overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt={p.nombre} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="industrial-title text-4xl text-muted-foreground">{p.nombre.charAt(0)}</span>
                )}
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="industrial-title text-base truncate">{p.nombre}</h3>
                    <p className="text-xs text-muted-foreground">{p.sku} · {LINEA_LABEL[p.linea]}</p>
                  </div>
                  <Badge variant="outline" className={p.stock > 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                    {p.stock > 0 ? `Stock: ${p.stock}` : "Agotado"}
                  </Badge>
                </div>
                {p.descripcion && <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>}
                <div className="flex items-center justify-between pt-1">
                  <span className="industrial-title text-lg">Bs {p.precio.toFixed(2)}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" onClick={() => setInfo(p)}><Info className="h-4 w-4" /></Button>
                    <Button size="sm" disabled={p.stock <= 0} onClick={() => add(p)} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit sticky top-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="industrial-title flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-brand" /> Carrito</h3>
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Vacío</p>}
            {cart.map((c) => (
              <div key={c.producto_id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1"><p className="truncate">{c.nombre}</p><p className="text-xs text-muted-foreground">Bs {c.precio.toFixed(2)}</p></div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(c.producto_id)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center">{c.cantidad}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => add({ id: c.producto_id, nombre: c.nombre, sku: "", descripcion: null, ficha_tecnica: {}, presentaciones: null, linea: "", precio: c.precio, stock: c.max, imagen_url: null })}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rm(c.producto_id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            {cart.length > 0 && <>
              <div><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} /></div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="industrial-title text-xl">Bs {total.toFixed(2)}</span>
              </div>
              <Button onClick={submit} disabled={saving} className="w-full bg-primary text-brand hover:bg-primary/90 font-semibold uppercase">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar pedido"}
              </Button>
            </>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!info} onOpenChange={() => setInfo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="industrial-title">{info?.nombre}</DialogTitle></DialogHeader>
          {info && <div className="space-y-2 text-sm">
            <p>{info.descripcion}</p>
            {info.presentaciones && <p><strong>Presentaciones:</strong> {info.presentaciones.join(", ")}</p>}
            {info.ficha_tecnica && Object.entries(info.ficha_tecnica).length > 0 && (
              <div className="bg-muted p-3 rounded space-y-1">
                {Object.entries(info.ficha_tecnica).map(([k, v]) => (
                  <p key={k}><strong className="capitalize">{k.replace(/_/g, " ")}:</strong> {String(v)}</p>
                ))}
              </div>
            )}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
