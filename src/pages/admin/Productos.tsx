import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

const LINEAS = ["refrigerante", "anticongelante", "heavy_duty", "def", "limpieza"];

interface P { id: string; sku: string; nombre: string; linea: string; descripcion: string | null; presentaciones: string[] | null; activo: boolean; }

export default function AdminProductos() {
  const [items, setItems] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [form, setForm] = useState({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("productos").select("*").order("nombre");
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true }); setOpen(true); };
  const openEdit = (p: P) => { setEditing(p); setForm({ sku: p.sku, nombre: p.nombre, linea: p.linea, descripcion: p.descripcion ?? "", presentaciones: (p.presentaciones ?? []).join(","), activo: p.activo }); setOpen(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      sku: form.sku.trim(), nombre: form.nombre.trim(), linea: form.linea as any,
      descripcion: form.descripcion.trim() || null,
      presentaciones: form.presentaciones.split(",").map((s) => s.trim()).filter(Boolean),
      activo: form.activo,
    };
    const { error } = editing
      ? await supabase.from("productos").update(payload).eq("id", editing.id)
      : await supabase.from("productos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Guardado"); setOpen(false); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="industrial-title text-3xl">Productos</h1><p className="text-sm text-muted-foreground">Catálogo Westone</p></div>
        <Button onClick={openNew} className="bg-brand text-brand-foreground"><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">{p.sku} · {p.linea}{!p.activo && " · INACTIVO"}</p>
                </div>
                <Button size="icon" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nuevo"} producto</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required maxLength={50} /></div>
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required maxLength={150} /></div>
            <div><Label>Línea</Label>
              <Select value={form.linea} onValueChange={(v) => setForm({ ...form, linea: v })}>
                <SelectTrigger /><SelectContent>{LINEAS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={500} /></div>
            <div><Label>Presentaciones (separadas por coma)</Label><Input value={form.presentaciones} onChange={(e) => setForm({ ...form, presentaciones: e.target.value })} placeholder="1L,4L,20L" /></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="activo" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /><Label htmlFor="activo">Activo</Label></div>
            <DialogFooter><Button type="submit" className="bg-primary text-brand">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
