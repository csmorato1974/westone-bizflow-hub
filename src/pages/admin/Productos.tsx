import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Upload, Trash2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const LINEAS = ["refrigerante", "anticongelante", "heavy_duty", "def", "limpieza"];
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

interface P { id: string; sku: string; nombre: string; linea: string; descripcion: string | null; presentaciones: string[] | null; activo: boolean; imagen_url: string | null; }

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-14 h-14 rounded bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        <ImageOff className="h-5 w-5 opacity-60" />
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="w-14 h-14 rounded object-cover bg-muted shrink-0" />
  );
}

export default function AdminProductos() {
  const [items, setItems] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [form, setForm] = useState({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true });
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgPreviewFailed, setImgPreviewFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("productos").select("*").order("nombre");
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ sku: "", nombre: "", linea: "refrigerante", descripcion: "", presentaciones: "", activo: true });
    setImgUrl(null); setImgPreviewFailed(false);
    setOpen(true);
  };
  const openEdit = (p: P) => {
    setEditing(p);
    setForm({ sku: p.sku, nombre: p.nombre, linea: p.linea, descripcion: p.descripcion ?? "", presentaciones: (p.presentaciones ?? []).join(","), activo: p.activo });
    setImgUrl(p.imagen_url); setImgPreviewFailed(false);
    setOpen(true);
  };

  const pathFromPublicUrl = (url: string): string | null => {
    const marker = "/object/public/productos/";
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  };

  const handleUpload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) return toast.error("Formato inválido. Usa JPG, PNG o WEBP.");
    if (file.size > MAX_BYTES) return toast.error("Archivo > 3 MB. Comprime la imagen.");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const productId = editing?.id ?? "tmp";
      const path = `${productId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("productos").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("productos").getPublicUrl(path);
      const newUrl = pub.publicUrl;

      // Si estamos editando, persistir y borrar la imagen anterior
      if (editing) {
        const { error: updErr } = await supabase.from("productos").update({ imagen_url: newUrl }).eq("id", editing.id);
        if (updErr) throw updErr;
        if (editing.imagen_url) {
          const oldPath = pathFromPublicUrl(editing.imagen_url);
          if (oldPath) await supabase.storage.from("productos").remove([oldPath]);
        }
        await logAudit("subir_imagen_producto", "productos", editing.id, { sku: editing.sku, path });
      }
      setImgUrl(newUrl); setImgPreviewFailed(false);
      toast.success("Imagen subida");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Error al subir");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!editing || !editing.imagen_url) {
      setImgUrl(null);
      return;
    }
    if (!confirm("¿Eliminar la imagen del producto?")) return;
    setUploading(true);
    try {
      const oldPath = pathFromPublicUrl(editing.imagen_url);
      const { error: updErr } = await supabase.from("productos").update({ imagen_url: null }).eq("id", editing.id);
      if (updErr) throw updErr;
      if (oldPath) await supabase.storage.from("productos").remove([oldPath]);
      await logAudit("eliminar_imagen_producto", "productos", editing.id, { sku: editing.sku });
      setImgUrl(null); setImgPreviewFailed(false);
      toast.success("Imagen eliminada");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      sku: form.sku.trim(), nombre: form.nombre.trim(), linea: form.linea as any,
      descripcion: form.descripcion.trim() || null,
      presentaciones: form.presentaciones.split(",").map((s) => s.trim()).filter(Boolean),
      activo: form.activo,
      imagen_url: imgUrl,
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
                  <ProductThumb src={p.imagen_url} alt={p.nombre} />
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
              <Label>Imagen principal</Label>
              <div className="flex items-start gap-3 mt-1">
                <div className="w-24 h-24 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {imgUrl && !imgPreviewFailed ? (
                    <img src={imgUrl} alt="preview" className="w-full h-full object-cover" onError={() => setImgPreviewFailed(true)} />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground opacity-60" />
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (!editing) {
                        toast.error("Guarda el producto primero, luego sube la imagen.");
                        if (fileRef.current) fileRef.current.value = "";
                        return;
                      }
                      handleUpload(f);
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {imgUrl ? "Cambiar imagen" : "Subir imagen"}
                  </Button>
                  {imgUrl && editing && (
                    <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={handleRemove}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">JPG, PNG o WEBP · máx. 3 MB</p>
                </div>
              </div>
            </div>
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
