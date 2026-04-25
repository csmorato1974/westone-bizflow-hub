import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { uploadProductImage, productImageUrl } from "@/lib/productImage";

interface Row {
  producto_id: string;
  cantidad: number;
  productos: { nombre: string; sku: string; imagen_url: string | null } | null;
}

export default function AdminStock() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("stock").select("producto_id,cantidad,productos(nombre,sku,imagen_url)");
    setRows((data as any) ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (producto_id: string) => {
    const cantidad = edits[producto_id];
    if (cantidad == null || cantidad < 0) return;
    const { error } = await supabase.from("stock").update({ cantidad, updated_at: new Date().toISOString() }).eq("producto_id", producto_id);
    if (error) return toast.error(error.message);
    await logAudit("ajuste_stock", "stock", producto_id, { cantidad });
    toast.success("Stock actualizado"); load();
  };

  const triggerUpload = (id: string) => { setPendingTarget(id); fileInputRef.current?.click(); };

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

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      <div><h1 className="industrial-title text-3xl">Stock</h1><p className="text-sm text-muted-foreground">Ajustes manuales registrados en auditoría</p></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.producto_id}>
              <CardContent className="p-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => triggerUpload(r.producto_id)}
                  className="h-16 w-16 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border hover:border-brand transition-colors relative group"
                  title="Subir / cambiar imagen"
                >
                  {r.productos?.imagen_url ? (
                    <img src={productImageUrl(r.productos.imagen_url)!} alt={r.productos.nombre} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    {uploadingId === r.producto_id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{r.productos?.nombre}</p>
                  <p className="text-xs text-muted-foreground">{r.productos?.sku} · Actual: {r.cantidad}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Input type="number" min="0" defaultValue={r.cantidad} onChange={(e) => setEdits({ ...edits, [r.producto_id]: parseInt(e.target.value) })} className="w-20" />
                  <Button size="icon" onClick={() => save(r.producto_id)} className="bg-brand text-brand-foreground"><Save className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
