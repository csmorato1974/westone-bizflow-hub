import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Upload, Image as ImageIcon, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { uploadProductImage, productImageUrl } from "@/lib/productImage";

interface Variante {
  id: string;
  presentacion: string;
  sku_variante: string | null;
  activa: boolean;
  cantidad: number;
}
interface ProductoGroup {
  id: string;
  nombre: string;
  sku: string;
  imagen_url: string | null;
  variantes: Variante[];
}

export default function AdminStock() {
  const [groups, setGroups] = useState<ProductoGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    // Consulta dividida: variantes + productos por un lado, stock por otro.
    // Evita problemas de embedding (objeto vs array) en la respuesta.
    const { data: variantes, error: vErr } = await supabase
      .from("producto_variantes")
      .select("id,presentacion,sku_variante,activa,orden,producto_id,productos(id,nombre,sku,imagen_url)")
      .order("orden", { ascending: true });
    if (vErr) { toast.error(vErr.message); setLoading(false); return; }

    const ids = (variantes ?? []).map((v: any) => v.id).filter(Boolean) as string[];
    const stockMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: stockRows } = await supabase
        .from("variante_stock")
        .select("variante_id,cantidad")
        .in("variante_id", ids);
      (stockRows ?? []).forEach((s: any) => stockMap.set(s.variante_id, Number(s.cantidad ?? 0)));
    }

    const map = new Map<string, ProductoGroup>();
    (variantes ?? []).forEach((v: any) => {
      const p = v.productos;
      if (!p) return;
      if (!map.has(p.id)) map.set(p.id, { id: p.id, nombre: p.nombre, sku: p.sku, imagen_url: p.imagen_url ?? null, variantes: [] });
      map.get(p.id)!.variantes.push({
        id: v.id,
        presentacion: v.presentacion,
        sku_variante: v.sku_variante,
        activa: v.activa,
        cantidad: stockMap.get(v.id) ?? 0,
      });
    });
    const list = Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    setGroups(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (variante_id: string) => {
    const cantidad = edits[variante_id];
    if (cantidad == null || cantidad < 0 || isNaN(cantidad)) return toast.error("Cantidad inválida");
    const { error } = await supabase
      .from("variante_stock")
      .upsert({ variante_id, cantidad, updated_at: new Date().toISOString() }, { onConflict: "variante_id" });
    if (error) return toast.error(error.message);
    await logAudit("ajuste_stock_variante", "variante_stock", variante_id, { cantidad });
    toast.success("Stock actualizado");
    // limpiar edición y refrescar para reflejar el nuevo "Actual"
    setEdits((prev) => {
      const next = { ...prev };
      delete next[variante_id];
      return next;
    });
    // Actualización optimista local + reload en background
    setGroups((prev) => prev.map((g) => ({
      ...g,
      variantes: g.variantes.map((v) => v.id === variante_id ? { ...v, cantidad } : v),
    })));
    load();
  };

  const triggerUpload = (productoId: string) => { setPendingTarget(productoId); fileInputRef.current?.click(); };

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
      <div>
        <h1 className="industrial-title text-3xl">Stock</h1>
        <p className="text-sm text-muted-foreground">Stock por presentación · ajustes registrados en auditoría</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => triggerUpload(g.id)}
                    className="h-14 w-14 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border hover:border-brand transition-colors relative group"
                    title="Subir / cambiar imagen"
                  >
                    {g.imagen_url ? (
                      <img src={productImageUrl(g.imagen_url)!} alt={g.nombre} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      {uploadingId === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{g.nombre}</p>
                    <p className="text-xs text-muted-foreground">{g.sku}</p>
                  </div>
                </div>
                <div className="border-t pt-2 space-y-1">
                  {g.variantes.length === 0 && <p className="text-xs text-muted-foreground">Sin presentaciones definidas.</p>}
                  {g.variantes.map((v) => {
                    const editing = edits[v.id];
                    const currentValue = editing != null && !isNaN(editing) ? editing : v.cantidad;
                    const dirty = editing != null && editing !== v.cantidad;
                    return (
                      <div key={v.id} className="flex items-center gap-2 text-sm py-1">
                        <span className={`flex-1 ${!v.activa && "text-muted-foreground line-through"}`}>
                          <span className="font-semibold">{v.presentacion}</span>
                          {v.sku_variante && <span className="ml-2 text-xs font-mono text-muted-foreground">{v.sku_variante}</span>}
                          <span className="ml-2 text-xs text-muted-foreground">· Actual: {v.cantidad}</span>
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={currentValue}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setEdits({ ...edits, [v.id]: raw === "" ? NaN : parseInt(raw) });
                          }}
                          className={`w-20 ${dirty ? "border-brand" : ""}`}
                        />
                        <Button size="icon" onClick={() => save(v.id)} disabled={!dirty} className="bg-brand text-brand-foreground">
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
