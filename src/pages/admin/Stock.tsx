import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Row { producto_id: string; cantidad: number; productos: { nombre: string; sku: string } | null; }

export default function AdminStock() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, number>>({});

  const load = async () => {
    const { data } = await supabase.from("stock").select("producto_id,cantidad,productos(nombre,sku)");
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

  return (
    <div className="space-y-4">
      <div><h1 className="industrial-title text-3xl">Stock</h1><p className="text-sm text-muted-foreground">Ajustes manuales registrados en auditoría</p></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.producto_id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.productos?.nombre}</p>
                  <p className="text-xs text-muted-foreground">{r.productos?.sku} · Actual: {r.cantidad}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Input type="number" min="0" defaultValue={r.cantidad} onChange={(e) => setEdits({ ...edits, [r.producto_id]: parseInt(e.target.value) })} className="w-24" />
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
