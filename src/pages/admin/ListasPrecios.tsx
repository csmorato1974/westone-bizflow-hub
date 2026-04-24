import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Lista { id: string; nombre: string; descripcion: string | null; activa: boolean; }
interface Item { id: string; producto_id: string; precio: number; productos: { nombre: string; sku: string } | null; }

export default function AdminListas() {
  const [listas, setListas] = useState<Lista[]>([]);
  const [productos, setProductos] = useState<{ id: string; nombre: string; sku: string }[]>([]);
  const [selected, setSelected] = useState<Lista | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [addProd, setAddProd] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const loadListas = async () => {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from("listas_precios").select("*").order("nombre"),
      supabase.from("productos").select("id,nombre,sku").eq("activo", true).order("nombre"),
    ]);
    setListas(l ?? []); setProductos(p ?? []);
    if (!selected && l && l[0]) setSelected(l[0]);
    setLoading(false);
  };
  useEffect(() => { loadListas(); }, []);

  useEffect(() => {
    if (!selected) return;
    supabase.from("lista_precio_items").select("id,producto_id,precio,productos(nombre,sku)").eq("lista_id", selected.id)
      .then(({ data }) => setItems((data as any) ?? []));
  }, [selected]);

  const createLista = async () => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("listas_precios").insert({ nombre: name.trim() }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Lista creada"); setOpen(false); setName(""); setSelected(data); loadListas();
  };

  const addItem = async () => {
    if (!selected || !addProd || !addPrice) return;
    const precio = parseFloat(addPrice);
    if (isNaN(precio) || precio < 0) return toast.error("Precio inválido");
    const { error } = await supabase.from("lista_precio_items").upsert({ lista_id: selected.id, producto_id: addProd, precio }, { onConflict: "lista_id,producto_id" });
    if (error) return toast.error(error.message);
    setAddProd(""); setAddPrice("");
    supabase.from("lista_precio_items").select("id,producto_id,precio,productos(nombre,sku)").eq("lista_id", selected.id)
      .then(({ data }) => setItems((data as any) ?? []));
  };
  const rmItem = async (id: string) => {
    await supabase.from("lista_precio_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="industrial-title text-3xl">Listas de Precios</h1></div>
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
                <h3 className="industrial-title">{selected.nombre}</h3>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[200px]"><Label>Producto</Label>
                    <Select value={addProd} onValueChange={setAddProd}>
                      <SelectTrigger /><SelectContent>{productos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Precio Bs</Label><Input type="number" step="0.01" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} className="w-28" /></div>
                  <Button onClick={addItem} className="bg-brand text-brand-foreground"><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between border-b py-1.5 text-sm">
                      <span>{it.productos?.nombre}</span>
                      <div className="flex items-center gap-2">
                        <span className="industrial-title">Bs {Number(it.precio).toFixed(2)}</span>
                        <Button size="icon" variant="ghost" onClick={() => rmItem(it.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
