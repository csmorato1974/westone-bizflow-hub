import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface Lista { id: string; nombre: string; descripcion: string | null; activa: boolean; }
interface VarianteRow {
  id: string;
  presentacion: string;
  sku_variante: string | null;
  activa: boolean;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  precio: number | null; // null si no hay item en esta lista
  item_id: string | null;
}

export default function AdminListas() {
  const [listas, setListas] = useState<Lista[]>([]);
  const [selected, setSelected] = useState<Lista | null>(null);
  const [rows, setRows] = useState<VarianteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({}); // variante_id -> precio string
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const loadListas = async () => {
    const { data: l } = await supabase.from("listas_precios").select("*").order("nombre");
    setListas(l ?? []);
    if (!selected && l && l[0]) setSelected(l[0]);
    setLoading(false);
  };
  useEffect(() => { loadListas(); }, []);

  const loadRows = useCallback(async (listaId: string) => {
    setLoadingRows(true);
    // Todas las variantes activas + producto + precio en esta lista
    const [{ data: variantes }, { data: items }] = await Promise.all([
      supabase
        .from("producto_variantes")
        .select("id,presentacion,sku_variante,activa,producto_id,productos(nombre,sku,activo)")
        .eq("activa", true)
        .order("presentacion"),
      supabase
        .from("lista_precio_variante_items")
        .select("id,variante_id,precio")
        .eq("lista_id", listaId),
    ]);
    const priceMap = new Map<string, { item_id: string; precio: number }>();
    (items ?? []).forEach((it: any) => priceMap.set(it.variante_id, { item_id: it.id, precio: Number(it.precio) }));
    const list: VarianteRow[] = (variantes ?? [])
      .filter((v: any) => v.productos?.activo)
      .map((v: any) => ({
        id: v.id,
        presentacion: v.presentacion,
        sku_variante: v.sku_variante,
        activa: v.activa,
        producto_id: v.producto_id,
        producto_nombre: v.productos?.nombre ?? "—",
        producto_sku: v.productos?.sku ?? "",
        precio: priceMap.get(v.id)?.precio ?? null,
        item_id: priceMap.get(v.id)?.item_id ?? null,
      }))
      .sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre) || a.presentacion.localeCompare(b.presentacion));
    setRows(list);
    setEdits({});
    setLoadingRows(false);
  }, []);

  useEffect(() => {
    if (selected) loadRows(selected.id);
  }, [selected, loadRows]);

  const createLista = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("listas_precios").insert({ nombre: name.trim() }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Lista creada"); setOpen(false); setName(""); setSelected(data); loadListas();
  };

  const savePrecio = async (row: VarianteRow) => {
    if (!selected) return;
    const raw = edits[row.id];
    if (raw == null || raw === "") return;
    const precio = parseFloat(raw);
    if (isNaN(precio) || precio < 0) return toast.error("Precio inválido");
    setSavingId(row.id);
    const { error } = await supabase
      .from("lista_precio_variante_items")
      .upsert({ lista_id: selected.id, variante_id: row.id, precio }, { onConflict: "lista_id,variante_id" });
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Precio guardado");
    loadRows(selected.id);
  };

  const removePrecio = async (row: VarianteRow) => {
    if (!row.item_id || !selected) return;
    if (!confirm(`¿Quitar precio de ${row.producto_nombre} ${row.presentacion} de esta lista?`)) return;
    const { error } = await supabase.from("lista_precio_variante_items").delete().eq("id", row.item_id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    loadRows(selected.id);
  };

  const filtered = rows.filter((r) => {
    const q = filter.toLowerCase();
    return r.producto_nombre.toLowerCase().includes(q) || r.presentacion.toLowerCase().includes(q) || r.producto_sku.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="industrial-title text-3xl">Listas de Precios</h1>
          <p className="text-sm text-muted-foreground">Precios por presentación</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-brand text-brand-foreground"><Plus className="h-4 w-4" /> Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva lista</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <DialogFooter><Button onClick={createLista}>Crear</Button></DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {listas.map((l) => (
              <Card key={l.id} onClick={() => setSelected(l)} className={`cursor-pointer ${selected?.id === l.id ? "border-brand" : ""}`}>
                <CardContent className="p-3"><p className="font-semibold">{l.nombre}</p></CardContent>
              </Card>
            ))}
          </div>
          {selected && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="industrial-title">{selected.nombre}</h3>
                  <Input placeholder="Buscar producto o presentación…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
                </div>
                {loadingRows ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-1">
                    {filtered.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 border-b py-1.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="truncate"><span className="font-semibold">{r.producto_nombre}</span> · <span className="text-brand">{r.presentacion}</span></p>
                          <p className="text-xs text-muted-foreground">{r.producto_sku}{r.sku_variante && ` · ${r.sku_variante}`}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Bs</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={r.precio ?? ""}
                            placeholder="—"
                            onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}
                            className="w-24 h-8"
                          />
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => savePrecio(r)} disabled={savingId === r.id}>
                            {savingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          {r.item_id && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removePrecio(r)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {filtered.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Sin resultados.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
