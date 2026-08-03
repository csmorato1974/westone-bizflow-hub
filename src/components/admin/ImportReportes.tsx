import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Download, Loader2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

interface DetalleFila {
  fila?: number;
  nombre?: string;
  empresa?: string;
  email?: string;
  telefono_normalizado?: string;
  estado?: string;
  accion_tomada?: string;
  accion_propuesta?: string;
  motivo?: string;
  observaciones?: string[];
  external_import_key?: string;
  cliente_id?: string | null;
  user_id?: string | null;
}

interface Batch {
  id: string;
  user_id: string;
  origen: string;
  archivo: string | null;
  total_filas: number;
  creados: number;
  actualizados: number;
  vinculados: number;
  omitidos: number;
  revision: number;
  errores: number;
  detalle: DetalleFila[] | null;
  created_at: string;
}

export default function ImportReportes() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [autores, setAutores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast({ title: "No se pudo cargar el historial", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const lotes = (data ?? []) as unknown as Batch[];
    setBatches(lotes);

    const ids = [...new Set(lotes.map((b) => b.user_id))].filter(Boolean);
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      setAutores(
        Object.fromEntries(
          (profs ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]),
        ),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const descargar = (b: Batch) => {
    const headers = [
      "lote", "fecha", "ejecutado_por", "origen", "archivo", "fila", "empresa", "contacto",
      "telefono", "email", "rol", "estado", "accion_tomada", "motivo", "observaciones",
      "clave_importacion", "cliente_id", "user_id",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = (b.detalle ?? []).map((d) =>
      [
        b.id, b.created_at, autores[b.user_id] ?? b.user_id, b.origen, b.archivo ?? "",
        d.fila ?? "", d.empresa ?? "", d.nombre ?? "", d.telefono_normalizado ?? "", d.email ?? "",
        "cliente", d.estado ?? "", d.accion_tomada ?? d.accion_propuesta ?? "", d.motivo ?? "",
        (d.observaciones ?? []).join(" · "), d.external_import_key ?? "", d.cliente_id ?? "",
        d.user_id ?? "",
      ].map(esc).join(","),
    );
    const csv = [headers.join(","), ...filas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-import-${b.created_at.slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Reporte de auditoría de importaciones
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && batches.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no se ejecutó ninguna importación.</p>
        )}

        {batches.map((b) => {
          const open = abierto === b.id;
          return (
            <div key={b.id} className="rounded-md border">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left"
                onClick={() => setAbierto(open ? null : b.id)}
              >
                <div className="text-sm">
                  <p className="font-semibold">
                    {new Date(b.created_at).toLocaleString("es-MX")} · {b.archivo ?? b.origen}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ejecutado por {autores[b.user_id] ?? "—"} · {b.total_filas} filas
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge className="bg-success text-success-foreground">Creados {b.creados}</Badge>
                  <Badge className="bg-info text-info-foreground">Actualizados {b.actualizados}</Badge>
                  <Badge variant="outline">Vinculados {b.vinculados}</Badge>
                  <Badge variant="outline">Omitidos {b.omitidos}</Badge>
                  <Badge className="bg-warning text-warning-foreground">Revisión {b.revision}</Badge>
                  <Badge className="bg-destructive text-destructive-foreground">Errores {b.errores}</Badge>
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>

              {open && (
                <div className="space-y-2 border-t p-3">
                  <Button variant="outline" size="sm" onClick={() => descargar(b)}>
                    <Download className="mr-2 h-4 w-4" /> Descargar CSV del lote
                  </Button>
                  <div className="max-h-72 space-y-1 overflow-auto">
                    {(b.detalle ?? []).map((d, i) => (
                      <div key={`${b.id}-${d.fila ?? i}`} className="rounded border p-2 text-xs">
                        <p className="font-medium">
                          Fila {d.fila} · {d.empresa || d.nombre || "—"}
                        </p>
                        <p className="text-muted-foreground">
                          {d.estado} → {d.accion_tomada ?? d.accion_propuesta} · {d.motivo}
                        </p>
                      </div>
                    ))}
                    {(b.detalle ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Sin detalle por fila para este lote.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
