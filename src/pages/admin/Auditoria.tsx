import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Log { id: string; user_id: string | null; accion: string; entidad: string; entidad_id: string | null; detalle: any; created_at: string; }

export default function AdminAuditoria() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      setLogs(data ?? []); setLoading(false);
    })();
  }, []);

  const filtered = logs.filter((l) => !q || l.accion.includes(q) || l.entidad.includes(q));

  return (
    <div className="space-y-4">
      <div><h1 className="industrial-title text-3xl">Auditoría</h1><p className="text-sm text-muted-foreground">Últimas 500 acciones registradas</p></div>
      <Input placeholder="Filtrar por acción o entidad…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="space-y-1">
          {filtered.map((l) => (
            <Card key={l.id}><CardContent className="p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold">{l.accion} <span className="text-muted-foreground">· {l.entidad}</span></p>
                {l.detalle && <p className="text-xs text-muted-foreground font-mono truncate max-w-xl">{JSON.stringify(l.detalle)}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
