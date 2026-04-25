import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Minus, Trash2, ShoppingCart, Info, RefreshCw, MessageCircle, User } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { productImageUrl } from "@/lib/productImage";
import { Image as ImageIcon } from "lucide-react";

interface Producto { id: string; nombre: string; sku: string; descripcion: string | null; ficha_tecnica: any; presentaciones: string[] | null; linea: string; precio: number; stock: number; imagen_url: string | null; }
interface CartItem { producto_id: string; nombre: string; precio: number; cantidad: number; max: number; }
interface Vendedor { id: string; full_name: string | null; phone: string | null; email: string | null; }

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
  const [cliente, setCliente] = useState<{ id: string; lista_precio_id: string | null; vendedor_id: string | null } | null>(null);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [linea, setLinea] = useState<string>("all");
  const [info, setInfo] = useState<Producto | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProductos = useCallback(async (listaId: string) => {
    const { data: items } = await supabase
      .from("lista_precio_items")
      .select("precio, productos!inner(id,nombre,sku,descripcion,ficha_tecnica,presentaciones,linea,activo,imagen_url,stock(cantidad))")
      .eq("lista_id", listaId);
    const prods: Producto[] = (items ?? [])
      .filter((i: any) => i.productos?.activo)
      .map((i: any) => ({
        id: i.productos.id, nombre: i.productos.nombre, sku: i.productos.sku,
        descripcion: i.productos.descripcion, ficha_tecnica: i.productos.ficha_tecnica,
        presentaciones: i.productos.presentaciones, linea: i.productos.linea,
        imagen_url: i.productos.imagen_url ?? null,
        precio: Number(i.precio),
        stock: Array.isArray(i.productos.stock) && i.productos.stock[0] ? i.productos.stock[0].cantidad : 0,
      }));
    setProductos(prods);
  }, []);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: c } = await supabase.from("clientes").select("id,lista_precio_id,vendedor_id").eq("user_id", user.id).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCliente(c);
      if (c.vendedor_id) {
        const { data: v } = await supabase.from("profiles").select("id,full_name,phone,email").eq("id", c.vendedor_id).maybeSingle();
        if (v) setVendedor(v);
      }
      if (!c.lista_precio_id) { setLoading(false); return; }
      await loadProductos(c.lista_precio_id);
      setLoading(false);
    })();
  }, [user, loadProductos]);

  // Realtime stock updates
  useEffect(() => {
    if (!cliente?.lista_precio_id) return;
    const channel = supabase
      .channel("stock-cliente")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, (payload: any) => {
        const newRow = payload.new ?? payload.old;
        if (!newRow?.producto_id) return;
        setProductos((prev) => prev.map((p) => p.id === newRow.producto_id ? { ...p, stock: payload.new?.cantidad ?? 0 } : p));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cliente?.lista_precio_id]);

  const refresh = async () => {
    if (!cliente?.lista_precio_id) return;
    setRefreshing(true);
    await loadProductos(cliente.lista_precio_id);
    setRefreshing(false);
    toast.success("Stock actualizado");
  };

  const filtered = productos.filter((p) => (linea === "all" || p.linea === linea) && (p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())));
  const lineas = Array.from(new Set(productos.map((p) => p.linea)));

  const add = (p: Producto) => {
    if (p.stock <= 0) return toast.error("Sin stock");
    setCart((prev) => {
      const ex = prev.find((x) => x.producto_id === p.id);
      if (ex) {
        if (ex.cantidad >= ex.max) { toast.error("Stock insuficiente"); return prev; }
        return prev.map((x) => x.producto_id === p.id ? { ...x, cantidad: x.cantidad + 1, max: p.stock } : x);
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

    // Pre-checkout stock validation
    const ids = cart.map((c) => c.producto_id);
    const { data: stockData } = await supabase.from("stock").select("producto_id,cantidad").in("producto_id", ids);
    const stockMap = new Map((stockData ?? []).map((s: any) => [s.producto_id, s.cantidad]));
    const conflictos = cart.filter((c) => (stockMap.get(c.producto_id) ?? 0) < c.cantidad);
    if (conflictos.length > 0) {
      setSaving(false);
      toast.error(`Stock insuficiente: ${conflictos.map((c) => c.nombre).join(", ")}`);
      if (cliente.lista_precio_id) await loadProductos(cliente.lista_precio_id);
      return;
    }

    const { data: pedido, error } = await supabase.from("pedidos").insert({
      cliente_id: cliente.id, creado_por: user.id, estado: "enviado", total,
      vendedor_id: cliente.vendedor_id,
      notas: notas.trim() || null,
    }).select().single();
    if (error || !pedido) { setSaving(false); toast.error(error?.message ?? "Error"); return; }
    const { error: e2 } = await supabase.from("pedido_items").insert(
      cart.map((c) => ({ pedido_id: pedido.id, producto_id: c.producto_id, cantidad: c.cantidad, precio_unitario: c.precio }))
    );
    if (e2) { setSaving(false); toast.error(e2.message); return; }

    // Notify admins + assigned vendor
    const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    const recipients = new Set<string>((admins ?? []).map((a) => a.user_id));
    if (cliente.vendedor_id) recipients.add(cliente.vendedor_id);
    if (recipients.size > 0) {
      await supabase.from("notificaciones").insert(Array.from(recipients).map((uid) => ({
        user_id: uid, titulo: "Nuevo pedido cliente",
        mensaje: `Pedido #${pedido.numero} por Bs ${total.toFixed(2)}`, tipo: "pedido",
        link: uid === cliente.vendedor_id ? "/app/vendedor/pedidos" : "/app/admin/pedidos",
      })));
    }
    await logAudit("crear_pedido_cliente", "pedidos", pedido.id, { numero: pedido.numero, total });
    setSaving(false);
    setCart([]); setNotas("");
    toast.success(`Pedido #${pedido.numero} enviado`);
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin" />;
  if (!cliente) return <Card><CardContent className="p-8 text-center text-muted-foreground">Tu cuenta de cliente aún no está vinculada. Contacta a tu vendedor.</CardContent></Card>;
  if (!cliente.lista_precio_id) return <Card><CardContent className="p-8 text-center text-muted-foreground">No tienes una lista de precios asignada.</CardContent></Card>;

  const waLink = vendedor?.phone ? `https://wa.me/${vendedor.phone.replace(/\D/g, "")}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="industrial-title text-3xl">Catálogo Westone</h1>
          <p className="text-sm text-muted-foreground">Productos y precios autorizados</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Actualizar stock</span>
        </Button>
      </div>

      {vendedor && (
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-brand" />
              <span className="text-muted-foreground">Tu vendedor asignado:</span>
              <span className="font-semibold">{vendedor.full_name ?? vendedor.email ?? "—"}</span>
            </div>
            {waLink && (
              <Button asChild size="sm" variant="outline" className="border-success text-success hover:bg-success/10">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
              <button
                type="button"
                onClick={() => setInfo(p)}
                className="aspect-square bg-muted flex items-center justify-center overflow-hidden w-full group"
              >
                {p.imagen_url ? (
                  <img src={productImageUrl(p.imagen_url)!} alt={p.nombre} className="h-full w-full object-contain group-hover:scale-105 transition-transform" loading="lazy" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
              </button>
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
          {filtered.length === 0 && (
            <Card className="sm:col-span-2"><CardContent className="p-8 text-center text-muted-foreground">No hay productos que coincidan</CardContent></Card>
          )}
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
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => {
                    const p = productos.find((x) => x.id === c.producto_id);
                    if (p) add(p);
                  }}><Plus className="h-3 w-3" /></Button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="industrial-title text-2xl">{info?.nombre}</DialogTitle>
          </DialogHeader>
          {info && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center">
                  {info.imagen_url ? (
                    <img src={productImageUrl(info.imagen_url)!} alt={info.nombre} className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">SKU</p>
                    <p className="font-mono font-semibold">{info.sku}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Línea</p>
                    <p className="font-semibold">{LINEA_LABEL[info.linea] ?? info.linea}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Precio</p>
                    <p className="industrial-title text-xl">Bs {info.precio.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Disponibilidad</p>
                    <Badge variant="outline" className={info.stock > 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                      {info.stock > 0 ? `${info.stock} en stock` : "Agotado"}
                    </Badge>
                  </div>
                  {info.presentaciones && info.presentaciones.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Presentaciones</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {info.presentaciones.map((pr) => <Badge key={pr} variant="secondary">{pr}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {info.descripcion && (
                <div>
                  <h4 className="industrial-title text-sm mb-1">Descripción</h4>
                  <p className="text-sm text-muted-foreground">{info.descripcion}</p>
                </div>
              )}

              {info.ficha_tecnica && Object.entries(info.ficha_tecnica).length > 0 && (
                <div>
                  <h4 className="industrial-title text-sm mb-2">Ficha técnica</h4>
                  <div className="bg-muted rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(info.ficha_tecnica).map(([k, v], idx) => (
                          <tr key={k} className={idx % 2 === 0 ? "bg-background/50" : ""}>
                            <td className="px-3 py-2 font-medium capitalize w-1/3">{k.replace(/_/g, " ")}</td>
                            <td className="px-3 py-2 text-muted-foreground">{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button
                disabled={info.stock <= 0}
                onClick={() => { add(info); setInfo(null); }}
                className="w-full bg-brand text-brand-foreground hover:bg-brand-dark font-semibold uppercase"
              >
                <Plus className="h-4 w-4 mr-2" /> Agregar al carrito
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
