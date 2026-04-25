import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Minus, Trash2, ShoppingCart, Info, RefreshCw, MessageCircle, User } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { productImageUrl } from "@/lib/productImage";
import { Image as ImageIcon } from "lucide-react";

interface Variante {
  id: string;
  presentacion: string;
  precio: number;
  stock: number;
}
interface Producto {
  id: string;
  nombre: string;
  sku: string;
  descripcion: string | null;
  ficha_tecnica: any;
  linea: string;
  imagen_url: string | null;
  variantes: Variante[];
}
interface CartItem {
  variante_id: string;
  producto_id: string;
  nombre: string;
  presentacion: string;
  precio: number;
  cantidad: number;
  max: number;
}
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
  // selected variante per producto
  const [selectedVar, setSelectedVar] = useState<Record<string, string>>({});

  const loadProductos = useCallback(async (listaId: string) => {
    const { data: items } = await supabase
      .from("lista_precio_variante_items")
      .select("precio, producto_variantes!inner(id,presentacion,activa,producto_id,variante_stock(cantidad),productos!inner(id,nombre,sku,descripcion,ficha_tecnica,linea,activo,imagen_url))")
      .eq("lista_id", listaId);

    const map = new Map<string, Producto>();
    (items ?? []).forEach((row: any) => {
      const v = row.producto_variantes;
      const p = v?.productos;
      if (!v || !p || !p.activo || !v.activa) return;
      if (!map.has(p.id)) {
        map.set(p.id, {
          id: p.id, nombre: p.nombre, sku: p.sku, descripcion: p.descripcion,
          ficha_tecnica: p.ficha_tecnica, linea: p.linea, imagen_url: p.imagen_url ?? null,
          variantes: [],
        });
      }
      const stockArr = Array.isArray(v.variante_stock) ? v.variante_stock : [];
      map.get(p.id)!.variantes.push({
        id: v.id,
        presentacion: v.presentacion,
        precio: Number(row.precio),
        stock: stockArr[0]?.cantidad ?? 0,
      });
    });
    const list = Array.from(map.values())
      .map((p) => ({ ...p, variantes: p.variantes.sort((a, b) => a.presentacion.localeCompare(b.presentacion)) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setProductos(list);
    // pre-seleccionar primera variante con stock (o la primera)
    setSelectedVar((prev) => {
      const next = { ...prev };
      list.forEach((p) => {
        if (!next[p.id]) {
          const withStock = p.variantes.find((v) => v.stock > 0);
          next[p.id] = (withStock ?? p.variantes[0])?.id ?? "";
        }
      });
      return next;
    });
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

  // Realtime: stock por variante
  useEffect(() => {
    if (!cliente?.lista_precio_id) return;
    const channel = supabase
      .channel("vstock-cliente")
      .on("postgres_changes", { event: "*", schema: "public", table: "variante_stock" }, (payload: any) => {
        const newRow = payload.new ?? payload.old;
        if (!newRow?.variante_id) return;
        setProductos((prev) => prev.map((p) => ({
          ...p,
          variantes: p.variantes.map((v) => v.id === newRow.variante_id ? { ...v, stock: payload.new?.cantidad ?? 0 } : v),
        })));
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

  const getCurrentVariante = useCallback((p: Producto): Variante | null => {
    const id = selectedVar[p.id];
    return p.variantes.find((v) => v.id === id) ?? p.variantes[0] ?? null;
  }, [selectedVar]);

  const add = (p: Producto, v: Variante | null) => {
    if (!v) return toast.error("Sin presentaciones");
    if (v.stock <= 0) return toast.error("Sin stock");
    setCart((prev) => {
      const ex = prev.find((x) => x.variante_id === v.id);
      if (ex) {
        if (ex.cantidad >= ex.max) { toast.error("Stock insuficiente"); return prev; }
        return prev.map((x) => x.variante_id === v.id ? { ...x, cantidad: x.cantidad + 1, max: v.stock } : x);
      }
      return [...prev, { variante_id: v.id, producto_id: p.id, nombre: p.nombre, presentacion: v.presentacion, precio: v.precio, cantidad: 1, max: v.stock }];
    });
  };
  const dec = (varId: string) => setCart((prev) => prev.flatMap((x) => x.variante_id === varId ? (x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : []) : [x]));
  const rm = (varId: string) => setCart((prev) => prev.filter((x) => x.variante_id !== varId));
  const total = useMemo(() => cart.reduce((s, x) => s + x.cantidad * x.precio, 0), [cart]);

  const submit = async () => {
    if (!user || !cliente) return;
    if (cart.length === 0) return toast.error("Carrito vacío");
    setSaving(true);

    // Pre-checkout stock validation por variante
    const ids = cart.map((c) => c.variante_id);
    const { data: stockData } = await supabase.from("variante_stock").select("variante_id,cantidad").in("variante_id", ids);
    const stockMap = new Map((stockData ?? []).map((s: any) => [s.variante_id, s.cantidad]));
    const conflictos = cart.filter((c) => (stockMap.get(c.variante_id) ?? 0) < c.cantidad);
    if (conflictos.length > 0) {
      setSaving(false);
      toast.error(`Stock insuficiente: ${conflictos.map((c) => `${c.nombre} (${c.presentacion})`).join(", ")}`);
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
          {filtered.map((p) => {
            const v = getCurrentVariante(p);
            return (
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
                    <Badge variant="outline" className={(v?.stock ?? 0) > 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                      {(v?.stock ?? 0) > 0 ? `Stock: ${v!.stock}` : "Agotado"}
                    </Badge>
                  </div>
                  {p.descripcion && <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>}

                  {p.variantes.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Presentación</Label>
                      <Select
                        value={selectedVar[p.id] ?? ""}
                        onValueChange={(val) => setSelectedVar((s) => ({ ...s, [p.id]: val }))}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {p.variantes.map((vv) => (
                            <SelectItem key={vv.id} value={vv.id} disabled={vv.stock <= 0}>
                              {vv.presentacion} — Bs {vv.precio.toFixed(2)} {vv.stock <= 0 && "(agotado)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="industrial-title text-lg">Bs {(v?.precio ?? 0).toFixed(2)}</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={() => setInfo(p)}><Info className="h-4 w-4" /></Button>
                      <Button size="sm" disabled={!v || v.stock <= 0} onClick={() => add(p, v)} className="bg-brand text-brand-foreground hover:bg-brand-dark">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <Card className="sm:col-span-2"><CardContent className="p-8 text-center text-muted-foreground">No hay productos que coincidan</CardContent></Card>
          )}
        </div>

        <Card className="h-fit sticky top-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="industrial-title flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-brand" /> Carrito</h3>
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Vacío</p>}
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
                    const v = p?.variantes.find((x) => x.id === c.variante_id) ?? null;
                    if (p && v) add(p, v);
                  }}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rm(c.variante_id)}><Trash2 className="h-3 w-3" /></Button>
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
          {info && (() => {
            const v = getCurrentVariante(info);
            return (
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
                    {info.variantes.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Presentación</p>
                        <Select
                          value={selectedVar[info.id] ?? ""}
                          onValueChange={(val) => setSelectedVar((s) => ({ ...s, [info.id]: val }))}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {info.variantes.map((vv) => (
                              <SelectItem key={vv.id} value={vv.id} disabled={vv.stock <= 0}>
                                {vv.presentacion} — Bs {vv.precio.toFixed(2)} {vv.stock <= 0 && "(agotado)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Precio</p>
                      <p className="industrial-title text-xl">Bs {(v?.precio ?? 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Disponibilidad</p>
                      <Badge variant="outline" className={(v?.stock ?? 0) > 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                        {(v?.stock ?? 0) > 0 ? `${v!.stock} en stock` : "Agotado"}
                      </Badge>
                    </div>
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
                          {Object.entries(info.ficha_tecnica).map(([k, val], idx) => (
                            <tr key={k} className={idx % 2 === 0 ? "bg-background/50" : ""}>
                              <td className="px-3 py-2 font-medium capitalize w-1/3">{k.replace(/_/g, " ")}</td>
                              <td className="px-3 py-2 text-muted-foreground">{String(val)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <Button
                  disabled={!v || v.stock <= 0}
                  onClick={() => { add(info, v); setInfo(null); }}
                  className="w-full bg-brand text-brand-foreground hover:bg-brand-dark font-semibold uppercase"
                >
                  <Plus className="h-4 w-4 mr-2" /> Agregar al carrito
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
