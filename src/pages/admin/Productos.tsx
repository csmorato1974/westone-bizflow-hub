import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Image as ImageIcon, Upload, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { uploadProductImage, deleteProductImage, productImageUrl } from "@/lib/productImage";

const LINEAS = ["refrigerante", "anticongelante", "heavy_duty", "def", "limpieza"];

interface P { id: string; sku: string; nombre: string; linea: string; descripcion: string | null; presentaciones: string[] | null; activo: boolean; imagen_url: string | null; }
interface Variante { id: string; producto_id: string; presentacion: string; sku_variante: string | null; activa: boolean; orden: number; }

export default function AdminProductos() {
  const [items, setItems] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [form, setForm] = useState({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", activo: true });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [newVar, setNewVar] = useState({ presentacion: "", sku_variante: "" });
  const [savingVar, setSavingVar] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("productos").select("*").order("nombre");
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadVariantes = useCallback(async (productoId: string) => {
    const { data } = await supabase
      .from("producto_variantes")
      .select("id,producto_id,presentacion,sku_variante,activa,orden")
      .eq("producto_id", productoId)
      .order("orden", { ascending: true })
      .order("presentacion", { ascending: true });
    setVariantes(data ?? []);
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", activo: true });
    setVariantes([]);
    setOpen(true);
  };
  const openEdit = (p: P) => {
    setEditing(p);
    setForm({ sku: p.sku, nombre: p.nombre, linea: p.linea, descripcion: p.descripcion ?? "", activo: p.activo });
    loadVariantes(p.id);
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      sku: form.sku.trim(), nombre: form.nombre.trim(), linea: form.linea as any,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
    };
    const { error } = editing
      ? await supabase.from("productos").update(payload).eq("id", editing.id)
      : await supabase.from("productos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Guardado"); setOpen(false); load();
  };

  const triggerUpload = (productoId: string) => {
    setPendingTarget(productoId);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingTarget) return;
    const targetId = pendingTarget;
    setPendingTarget(null);
    setUploadingId(targetId);
    try {
      await uploadProductImage(targetId, file);
      toast.success("Imagen actualizada");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploadingId(null);
    }
  };

  const removeImage = async (productoId: string) => {
    if (!confirm("¿Eliminar la imagen de este producto?")) return;
    setUploadingId(productoId);
    try {
      await deleteProductImage(productoId);
      toast.success("Imagen eliminada");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Error");
    } finally {
      setUploadingId(null);
    }
  };

  const addVariante = async () => {
    if (!editing || !newVar.presentacion.trim()) return;
    setSavingVar(true);
    const { data, error } = await supabase
      .from("producto_variantes")
      .insert({ producto_id: editing.id, presentacion: newVar.presentacion.trim(), sku_variante: newVar.sku_variante.trim() || null, orden: variantes.length })
      .select()
      .single();
    if (error) { setSavingVar(false); return toast.error(error.message); }
    // Crear stock 0
    await supabase.from("variante_stock").insert({ variante_id: data.id, cantidad: 0 });
    setNewVar({ presentacion: "", sku_variante: "" });
    setSavingVar(false);
    toast.success("Presentación agregada");
    loadVariantes(editing.id);
  };

  const toggleVariante = async (v: Variante) => {
    const { error } = await supabase.from("producto_variantes").update({ activa: !v.activa }).eq("id", v.id);
    if (error) return toast.error(error.message);
    if (editing) loadVariantes(editing.id);
  };

  const deleteVariante = async (v: Variante) => {
    if (!confirm(`¿Eliminar la presentación "${v.presentacion}"? Si tiene pedidos o precios asociados, se desactivará en su lugar.`)) return;
    const { error } = await supabase.from("producto_variantes").delete().eq("id", v.id);
    if (error) {
      // probablemente FK; desactivar
      await supabase.from("producto_variantes").update({ activa: false }).eq("id", v.id);
      toast.info("Presentación desactivada (tenía datos asociados)");
    } else {
      toast.success("Eliminada");
    }
    if (editing) loadVariantes(editing.id);
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      <div className="flex items-center justify-between">
        <div><h1 className="industrial-title text-3xl">Productos</h1><p className="text-sm text-muted-foreground">Catálogo Westone</p></div>
        <Button onClick={openNew} className="bg-brand text-brand-foreground"><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-16 w-16 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                  {p.imagen_url ? (
                    <img src={productImageUrl(p.imagen_url)!} alt={p.nombre} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">{p.sku} · {p.linea}{!p.activo && " · INACTIVO"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="outline" onClick={() => openEdit(p)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="outline" onClick={() => triggerUpload(p.id)} disabled={uploadingId === p.id} title="Subir imagen">
                    {uploadingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  {p.imagen_url && (
                    <Button size="icon" variant="outline" onClick={() => removeImage(p.id)} disabled={uploadingId === p.id} title="Eliminar imagen">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
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
            <div className="flex items-center gap-2"><input type="checkbox" id="activo" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /><Label htmlFor="activo">Activo</Label></div>

            {editing && (
              <div className="space-y-2 border-t pt-3">
                <Label className="flex items-center gap-2"><Package className="h-4 w-4" /> Presentaciones (variantes)</Label>
                <p className="text-xs text-muted-foreground">Cada presentación tiene su propio stock y precio en cada lista.</p>
                <div className="space-y-1">
                  {variantes.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 border rounded px-2 py-1.5 text-sm">
                      <span className={`font-semibold flex-1 ${!v.activa && "line-through text-muted-foreground"}`}>{v.presentacion}</span>
                      {v.sku_variante && <span className="text-xs font-mono text-muted-foreground">{v.sku_variante}</span>}
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleVariante(v)}>{v.activa ? "Desactivar" : "Activar"}</Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => deleteVariante(v)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  ))}
                  {variantes.length === 0 && <p className="text-xs text-muted-foreground">Sin presentaciones.</p>}
                </div>
                <div className="flex gap-2 items-end pt-2">
                  <div className="flex-1"><Label className="text-xs">Presentación</Label><Input placeholder="ej. 1L, 4L, 20L" value={newVar.presentacion} onChange={(e) => setNewVar({ ...newVar, presentacion: e.target.value })} /></div>
                  <div className="w-32"><Label className="text-xs">SKU (opcional)</Label><Input value={newVar.sku_variante} onChange={(e) => setNewVar({ ...newVar, sku_variante: e.target.value })} /></div>
                  <Button type="button" onClick={addVariante} disabled={savingVar || !newVar.presentacion.trim()} className="bg-brand text-brand-foreground">
                    {savingVar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {editing && (
              <div className="space-y-2 border-t pt-3">
                <Label>Imagen del producto</Label>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 rounded bg-muted flex items-center justify-center overflow-hidden border">
                    {editing.imagen_url ? (
                      <img src={productImageUrl(editing.imagen_url)!} alt={editing.nombre} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => triggerUpload(editing.id)} disabled={uploadingId === editing.id}>
                      {uploadingId === editing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir / cambiar
                    </Button>
                    {editing.imagen_url && (
                      <Button type="button" variant="outline" size="sm" onClick={() => removeImage(editing.id)} disabled={uploadingId === editing.id}>
                        <Trash2 className="h-4 w-4 text-destructive" /> Eliminar
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG o WEBP · máx. 5MB</p>
              </div>
            )}
            <DialogFooter><Button type="submit" className="bg-primary text-brand">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
