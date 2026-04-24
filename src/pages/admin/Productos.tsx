import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Upload, X } from "lucide-react";
import { toast } from "sonner";

const LINEAS = ["refrigerante", "anticongelante", "heavy_duty", "def", "limpieza"];

interface P { id: string; sku: string; nombre: string; linea: string; descripcion: string | null; presentaciones: string[] | null; activo: boolean; imagen_url: string | null; }

export default function AdminProductos() {
  const [items, setItems] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [form, setForm] = useState({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true, imagen_url: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("productos").select("*").order("nombre");
    setItems((data ?? []) as P[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true, imagen_url: "" }); setOpen(true); };
  const openEdit = (p: P) => { setEditing(p); setForm({ sku: p.sku, nombre: p.nombre, linea: p.linea, descripcion: p.descripcion ?? "", presentaciones: (p.presentaciones ?? []).join(","), activo: p.activo, imagen_url: p.imagen_url ?? "" }); setOpen(true); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Máx 5MB");
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("productos").upload(path, file, { contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("productos").getPublicUrl(path);
    setForm((f) => ({ ...f, imagen_url: data.publicUrl }));
    setUploading(false);
    toast.success("Imagen subida");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      sku: form.sku.trim(), nombre: form.nombre.trim(), linea: form.linea as any,
      descripcion: form.descripcion.trim() || null,
      presentaciones: form.presentaciones.split(",").map((s) => s.trim()).filter(Boolean),
      activo: form.activo,
      imagen_url: form.imagen_url || null,
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
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground text-lg font-semibold">{p.nombre.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">{p.sku} · {p.linea}{!p.activo && " · INACTIVO"}</p>
                  </div>
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
            <div>
              <Label>Imagen</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-20 w-20 rounded border bg-muted overflow-hidden flex items-center justify-center shrink-0">
                  {form.imagen_url ? (
                    <img src={form.imagen_url} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin foto</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Subiendo…" : "Subir imagen"}
                  </Button>
                  {form.imagen_url && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, imagen_url: "" })}>
                      <X className="h-3 w-3" /> Quitar
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required maxLength={50} /></div>
            <div><Label>Nombre</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required maxLength={150} /></div>
            <div><Label>Línea</Label>
              <Select value={form.linea} onValueChange={(v) => setForm({ ...form, linea: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LINEAS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
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
