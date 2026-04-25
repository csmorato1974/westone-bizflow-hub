import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "@/components/EstadoBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Eye, Printer, Package, ChevronDown, ChevronUp } from "lucide-react";

interface PedidoItem {
  cantidad: number;
  precio_unitario: number;
  presentacion: string | null;
  subtotal: number | null;
  productos: { nombre: string; sku: string | null; imagen_url: string | null } | null;
}

interface Pedido {
  id: string;
  numero: number;
  estado: string;
  total: number;
  created_at: string;
  notas: string | null;
  vendedor_id: string | null;
  clientes: { empresa: string; contacto: string; celular: string; direccion: string | null } | null;
  pedido_items: PedidoItem[];
}

const ESTADOS = ["borrador", "enviado", "aprobado", "listo_despacho", "en_ruta", "entregado", "cancelado"];

export default function ClienteMisPedidos() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [vendedores, setVendedores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("pedidos")
      .select("id,numero,estado,total,created_at,notas,vendedor_id,clientes(empresa,contacto,celular,direccion),pedido_items(cantidad,precio_unitario,presentacion,subtotal,productos(nombre,sku,imagen_url))")
      .order("created_at", { ascending: false });
    const list = (data as any) ?? [];
    setPedidos(list);
    const ids = Array.from(new Set(list.map((p: Pedido) => p.vendedor_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? p.email ?? "—"; });
      setVendedores(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("cliente-mis-pedidos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (estadoFilter !== "todos" && p.estado !== estadoFilter) return false;
      if (!q) return true;
      if (String(p.numero).includes(q)) return true;
      return p.pedido_items?.some((it) => it.productos?.nombre?.toLowerCase().includes(q));
    });
  }, [pedidos, search, estadoFilter]);

  return (
    <div className="space-y-4 print:hidden">
      <div>
        <h1 className="industrial-title text-3xl">Mis Pedidos</h1>
        <p className="text-sm text-muted-foreground">Historial y estado de tus pedidos</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por número o producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Package className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              {pedidos.length === 0 ? "Aún no tienes pedidos." : "No hay pedidos que coincidan con el filtro."}
            </p>
            {pedidos.length === 0 && (
              <Button asChild variant="outline"><Link to="/app/catalogo">Explorar catálogo</Link></Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => {
            const itemsCount = p.pedido_items?.reduce((acc, it) => acc + Number(it.cantidad), 0) ?? 0;
            const isOpen = expandedId === p.id;
            return (
              <Card key={p.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="industrial-title text-lg">Pedido #{p.numero}</p>
                      <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                      {p.vendedor_id && vendedores[p.vendedor_id] && (
                        <p className="text-xs text-muted-foreground">Vendedor: <span className="font-medium text-foreground">{vendedores[p.vendedor_id]}</span></p>
                      )}
                      {p.clientes?.direccion && (
                        <p className="text-xs text-muted-foreground">Entrega: <span className="text-foreground">{p.clientes.direccion}</span></p>
                      )}
                      <p className="text-xs text-muted-foreground">{itemsCount} unidad(es) · {p.pedido_items?.length ?? 0} ítem(s)</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <EstadoBadge estado={p.estado} />
                      <span className="industrial-title text-lg">Bs {Number(p.total).toFixed(2)}</span>
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(isOpen ? null : p.id)}>
                        {isOpen ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                        {isOpen ? "Ocultar" : "Ver detalle"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelected(p)}>
                        <Eye className="h-4 w-4 mr-1" /> Imprimir
                      </Button>
                    </div>
                  </div>

                  <Collapsible open={isOpen}>
                    <CollapsibleContent>
                      <div className="border-t pt-3 space-y-3">
                        <div className="border rounded-md overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead>Presentación</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead className="text-right">P. Unit.</TableHead>
                                <TableHead className="text-right">Subtotal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {p.pedido_items?.map((it, idx) => {
                                const subtotal = Number(it.subtotal ?? Number(it.cantidad) * Number(it.precio_unitario));
                                return (
                                  <TableRow key={idx}>
                                    <TableCell>
                                      <div className="font-medium">{it.productos?.nombre ?? "—"}</div>
                                      {it.productos?.sku && <div className="text-xs text-muted-foreground">SKU: {it.productos.sku}</div>}
                                    </TableCell>
                                    <TableCell>{it.presentacion ?? "—"}</TableCell>
                                    <TableCell className="text-right">{it.cantidad}</TableCell>
                                    <TableCell className="text-right">Bs {Number(it.precio_unitario).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">Bs {subtotal.toFixed(2)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                            <TableFooter>
                              <TableRow>
                                <TableCell colSpan={4} className="text-right font-semibold">Total</TableCell>
                                <TableCell className="text-right industrial-title">Bs {Number(p.total).toFixed(2)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                        {p.notas && (
                          <div className="text-sm">
                            <p className="text-xs uppercase text-muted-foreground mb-1">Notas</p>
                            <p className="bg-muted/40 rounded p-2">{p.notas}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {!isOpen && (
                    <div className="border-t pt-2 text-sm space-y-1">
                      {p.pedido_items?.slice(0, 3).map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{it.cantidad}× {it.productos?.nombre}{it.presentacion && <span className="text-muted-foreground"> ({it.presentacion})</span>}</span>
                          <span className="text-muted-foreground">Bs {(it.cantidad * Number(it.precio_unitario)).toFixed(2)}</span>
                        </div>
                      ))}
                      {(p.pedido_items?.length ?? 0) > 3 && (
                        <p className="text-xs text-muted-foreground">+{(p.pedido_items?.length ?? 0) - 3} ítem(s) más…</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PedidoDetalleDialog
        pedido={selected}
        vendedorNombre={selected?.vendedor_id ? vendedores[selected.vendedor_id] : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function PedidoDetalleDialog({ pedido, vendedorNombre, onClose }: { pedido: Pedido | null; vendedorNombre?: string; onClose: () => void }) {
  if (!pedido) return null;
  const total = pedido.pedido_items?.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0) ?? Number(pedido.total);

  return (
    <Dialog open={!!pedido} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-full print:shadow-none">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 flex-wrap">
            <span className="industrial-title text-2xl">Pedido #{pedido.numero}</span>
            <div className="flex items-center gap-2 print:hidden">
              <EstadoBadge estado={pedido.estado} />
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Cliente</p>
              <p className="font-medium">{pedido.clientes?.empresa ?? "—"}</p>
              <p>{pedido.clientes?.contacto}</p>
              <p className="text-muted-foreground">{pedido.clientes?.celular}</p>
              {pedido.clientes?.direccion && <p className="text-muted-foreground">{pedido.clientes.direccion}</p>}
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Información</p>
              <p>Fecha: <span className="font-medium">{new Date(pedido.created_at).toLocaleString()}</span></p>
              <p>Vendedor: <span className="font-medium">{vendedorNombre ?? "—"}</span></p>
              <p>Estado: <span className="font-medium capitalize">{pedido.estado.replace("_", " ")}</span></p>
            </div>
          </div>

          {pedido.notas && (
            <div className="text-sm">
              <p className="text-xs uppercase text-muted-foreground mb-1">Notas</p>
              <p className="bg-muted/40 rounded p-2">{pedido.notas}</p>
            </div>
          )}

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Presentación</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">P. Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedido.pedido_items?.map((it, idx) => {
                  const subtotal = Number(it.subtotal ?? Number(it.cantidad) * Number(it.precio_unitario));
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="font-medium">{it.productos?.nombre ?? "—"}</div>
                        {it.productos?.sku && <div className="text-xs text-muted-foreground">SKU: {it.productos.sku}</div>}
                      </TableCell>
                      <TableCell>{it.presentacion ?? "—"}</TableCell>
                      <TableCell className="text-right">{it.cantidad}</TableCell>
                      <TableCell className="text-right">Bs {Number(it.precio_unitario).toFixed(2)}</TableCell>
                      <TableCell className="text-right">Bs {subtotal.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right industrial-title text-lg">Bs {total.toFixed(2)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
