import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface T { id: string; clave: string; nombre: string; mensaje: string; }

export default function AdminWhatsapp() {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase.from("whatsapp_templates").select("*").order("clave");
    setItems(data ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (id: string) => {
    const mensaje = edits[id];
    if (mensaje == null) return;
    const { error } = await supabase.from("whatsapp_templates").update({ mensaje, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada"); load();
  };

  return (
    <div className="space-y-4">
      <div><h1 className="industrial-title text-3xl">Plantillas WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Variables disponibles: {"{numero} {empresa} {contacto} {celular} {direccion} {total}"}</p>
      </div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="grid gap-3">
          {items.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-2">
                <p className="industrial-title">{t.nombre} <span className="text-xs text-muted-foreground">({t.clave})</span></p>
                <div><Label>Mensaje</Label>
                  <Textarea defaultValue={t.mensaje} rows={3} onChange={(e) => setEdits({ ...edits, [t.id]: e.target.value })} maxLength={1000} />
                </div>
                <Button onClick={() => save(t.id)} size="sm" className="bg-brand text-brand-foreground"><Save className="h-4 w-4" /> Guardar</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
