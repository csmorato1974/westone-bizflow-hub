import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  ImageOff,
  Loader2,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { WestoneLogo } from "@/components/WestoneLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  calcularTotalCarrito,
  cargarCatalogoPortal,
  cargarPedidosPortal,
  crearPedidoPortal,
  DISPONIBILIDAD_LABEL,
  normalizarTelefonoWhatsapp,
  type CatalogoPortal,
  type DisponibilidadPortal,
  type ItemCarritoPortal,
  type PedidoPortal,
  type ProductoPortal,
  type VariantePortal,
} from "@/lib/portalCliente";

const DISPONIBILIDAD_STYLE: Record<DisponibilidadPortal, string> = {
  disponible: "border-success/50 bg-success/10 text-success",
  poco_stock: "border-warning/60 bg-warning/10 text-warning-foreground",
  consultar: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

const LINEA_LABEL: Record<string, string> = {
  refrigerante: "Refrigerantes",
  anticongelante: "Anticongelantes",
  heavy_duty: "Heavy Duty",
  def: "DEF",
  limpieza: "Limpieza",
};

function mensajeErrorPortal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/enlace|portal|disponible/i.test(message)) return message;
  if (/disponibilidad|stock/i.test(message)) return "La disponibilidad cambió. Actualiza el catálogo y revisa el carrito.";
  if (/límite|limite/i.test(message)) return "Se hicieron varias solicitudes seguidas. Espera unos minutos e inténtalo de nuevo.";
  return "No se pudo completar la operación. Inténtalo nuevamente.";
}

export default function PortalCliente() {
  const { token = "" } = useParams();
  const [catalogo, setCatalogo] = useState<CatalogoPortal | null>(null);
  const [pedidos, setPedidos] = useState<PedidoPortal[]>([]);
  const [cart, setCart] = useState<ItemCarritoPortal[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [busqueda, setBusqueda] = useState("");
  const [linea, setLinea] = useState("todas");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [pedidoCreado, setPedidoCreado] = useState<number | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!token) {
      setFatalError("El enlace está incompleto.");
      setLoading(false);
      return;
    }
    if (!silencioso) setLoading(true);
    try {
      const [catalogoData, pedidosData] = await Promise.all([
        cargarCatalogoPortal(token),
        cargarPedidosPortal(token),
      ]);
      setCatalogo(catalogoData);
      setPedidos(pedidosData);
      setFatalError(null);
      setSeleccion((actual) => {
        const siguiente = { ...actual };
        catalogoData.productos.forEach((producto) => {
          if (!siguiente[producto.id]) {
            siguiente[producto.id] =
              producto.variantes.find((variante) => variante.disponibilidad !== "consultar")?.id
              ?? producto.variantes[0]?.id
              ?? "";
          }
        });
        return siguiente;
      });
    } catch (error) {
      setFatalError(mensajeErrorPortal(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);

  const lineas = useMemo(
    () => Array.from(new Set(catalogo?.productos.map((producto) => producto.linea) ?? [])),
    [catalogo],
  );

  const productos = useMemo(() => {
    const query = busqueda.trim().toLocaleLowerCase("es");
    return (catalogo?.productos ?? []).filter((producto) => {
      if (linea !== "todas" && producto.linea !== linea) return false;
      return !query || producto.nombre.toLocaleLowerCase("es").includes(query) || producto.sku.toLocaleLowerCase("es").includes(query);
    });
  }, [busqueda, catalogo, linea]);

  const total = useMemo(() => calcularTotalCarrito(cart), [cart]);

  const agregar = (producto: ProductoPortal, variante: VariantePortal) => {
    if (variante.disponibilidad === "consultar") {
      toast.message("Consulta esta presentación con tu vendedor.");
      return;
    }
    setCart((actual) => {
      const existente = actual.find((item) => item.variante_id === variante.id);
      if (existente) {
        if (existente.cantidad >= 99) return actual;
        return actual.map((item) => item.variante_id === variante.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...actual, {
        variante_id: variante.id,
        producto_id: producto.id,
        nombre: producto.nombre,
        presentacion: variante.presentacion,
        precio: Number(variante.precio),
        cantidad: 1,
      }];
    });
  };

  const reducir = (varianteId: string) => setCart((actual) => actual.flatMap((item) => {
    if (item.variante_id !== varianteId) return [item];
    return item.cantidad > 1 ? [{ ...item, cantidad: item.cantidad - 1 }] : [];
  }));

  const enviar = async () => {
    if (!token || cart.length === 0) return;
    setSending(true);
    try {
      const pedido = await crearPedidoPortal(token, cart, notas);
      setPedidoCreado(pedido.numero);
      setCart([]);
      setNotas("");
      await cargar(true);
      toast.success(`Solicitud #${pedido.numero} recibida`);
    } catch (error) {
      toast.error(mensajeErrorPortal(error));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen grid place-items-center bg-muted/30"><Loader2 className="h-8 w-8 animate-spin text-brand" /></main>;
  }

  if (fatalError || !catalogo) {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/30 p-4">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-4 p-8">
            <WestoneLogo className="justify-center" />
            <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="industrial-title text-2xl">Portal no disponible</h1>
            <p className="text-sm text-muted-foreground">{fatalError}</p>
            <p className="text-sm">Pide a tu vendedor Westone que te envíe un enlace nuevo.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const telefono = normalizarTelefonoWhatsapp(catalogo.vendedor.telefono);

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <WestoneLogo />
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); void cargar(true); }} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <section className="rounded-xl bg-primary px-5 py-6 text-primary-foreground shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-brand">Portal personalizado</p>
          <h1 className="industrial-title mt-1 text-3xl">Hola, {catalogo.cliente.contacto || catalogo.cliente.empresa}</h1>
          <p className="mt-2 max-w-2xl text-sm text-primary-foreground/75">
            Catálogo y precios preparados para {catalogo.cliente.empresa}. Envía tu solicitud sin crear una cuenta; tu vendedor confirmará disponibilidad y entrega.
          </p>
        </section>

        {pedidoCreado && (
          <Card className="border-success/40 bg-success/10">
            <CardContent className="flex items-start gap-3 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
              <div>
                <p className="font-semibold">Solicitud #{pedidoCreado} recibida</p>
                <p className="text-sm text-muted-foreground">Aún no descuenta stock. Tu vendedor la revisará y confirmará.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-brand/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Tu asesor Westone</p>
              <p className="font-semibold">{catalogo.vendedor.nombre}</p>
            </div>
            {telefono && (
              <Button asChild variant="outline" className="border-success/50 text-success hover:bg-success/10">
                <a href={`https://wa.me/${telefono}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar producto o código" className="pl-9" />
              </div>
              <Select value={linea} onValueChange={setLinea}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las líneas</SelectItem>
                  {lineas.map((item) => <SelectItem key={item} value={item}>{LINEA_LABEL[item] ?? item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {productos.map((producto) => {
                const variante = producto.variantes.find((item) => item.id === seleccion[producto.id]) ?? producto.variantes[0];
                return (
                  <Card key={producto.id} className="overflow-hidden">
                    <div className="flex h-40 items-center justify-center bg-background p-3">
                      {producto.imagen_url ? (
                        <img src={producto.imagen_url} alt={producto.nombre} className="h-full w-full object-contain" loading="lazy" />
                      ) : <ImageOff className="h-10 w-10 text-muted-foreground/40" />}
                    </div>
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <p className="font-semibold leading-tight">{producto.nombre}</p>
                        <p className="text-xs text-muted-foreground">{producto.sku} · {LINEA_LABEL[producto.linea] ?? producto.linea}</p>
                      </div>
                      {variante && (
                        <>
                          <Select value={variante.id} onValueChange={(value) => setSeleccion((actual) => ({ ...actual, [producto.id]: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {producto.variantes.map((item) => (
                                <SelectItem key={item.id} value={item.id}>{item.presentacion} — Bs {Number(item.precio).toFixed(2)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className={DISPONIBILIDAD_STYLE[variante.disponibilidad]}>
                              {DISPONIBILIDAD_LABEL[variante.disponibilidad]}
                            </Badge>
                            <span className="industrial-title text-lg">Bs {Number(variante.precio).toFixed(2)}</span>
                          </div>
                          <Button className="w-full bg-brand text-brand-foreground hover:bg-brand-dark" onClick={() => agregar(producto, variante)} disabled={variante.disponibilidad === "consultar"}>
                            <Plus className="h-4 w-4" /> {variante.disponibilidad === "consultar" ? "Consultar" : "Agregar"}
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {productos.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">No se encontraron productos.</CardContent></Card>}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 industrial-title"><ShoppingCart className="h-5 w-5" /> Tu solicitud</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {cart.length === 0 ? (
                  <p className="rounded-md bg-muted/50 p-4 text-center text-sm text-muted-foreground">Agrega productos para comenzar.</p>
                ) : cart.map((item) => (
                  <div key={item.variante_id} className="space-y-2 rounded-md border p-3">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{item.nombre}</p><p className="text-xs text-muted-foreground">{item.presentacion} · Bs {item.precio.toFixed(2)}</p></div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCart((actual) => actual.filter((line) => line.variante_id !== item.variante_id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => reducir(item.variante_id)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-8 text-center text-sm">{item.cantidad}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setCart((actual) => actual.map((line) => line.variante_id === item.variante_id && line.cantidad < 99 ? { ...line, cantidad: line.cantidad + 1 } : line))}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <span className="text-sm font-semibold">Bs {(item.precio * item.cantidad).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                <div><Label htmlFor="notas-portal">Notas para el vendedor</Label><Textarea id="notas-portal" value={notas} onChange={(event) => setNotas(event.target.value)} maxLength={500} placeholder="Entrega, horario o consulta especial" /></div>
                <Separator />
                <div className="flex items-center justify-between"><span className="font-semibold">Total referencial</span><span className="industrial-title text-xl">Bs {total.toFixed(2)}</span></div>
                <p className="text-xs text-muted-foreground">El precio se vuelve a validar al enviar. El stock se reserva cuando Westone confirma el pedido.</p>
                <Button className="w-full bg-primary font-semibold text-brand hover:bg-primary/90" onClick={enviar} disabled={sending || cart.length === 0}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Enviar solicitud
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className="space-y-3">
          <div><h2 className="industrial-title text-2xl">Solicitudes recientes</h2><p className="text-sm text-muted-foreground">Seguimiento de pedidos enviados desde este portal.</p></div>
          {pedidos.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todavía no hay solicitudes desde este enlace.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pedidos.map((pedido) => (
                <Card key={pedido.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="industrial-title text-lg">Pedido #{pedido.numero}</p><p className="text-xs text-muted-foreground">{new Date(pedido.created_at).toLocaleString("es-BO")}</p></div><Badge>{pedido.estado_label}</Badge></div>
                    <div className="space-y-1 text-sm">{pedido.items.map((item, index) => <div key={`${pedido.id}-${index}`} className="flex justify-between gap-2"><span>{item.cantidad}× {item.nombre} {item.presentacion}</span><span className="shrink-0 text-muted-foreground">Bs {Number(item.subtotal).toFixed(2)}</span></div>)}</div>
                    <Separator />
                    <div className="flex items-center justify-between"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> {pedido.estado_label}</span><span className="font-semibold">Bs {Number(pedido.total).toFixed(2)}</span></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
