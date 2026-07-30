import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Download, Loader2, Upload, AlertTriangle, ShieldAlert, Eye, EyeOff, Copy,
} from "lucide-react";
import {
  RULES_VERSION, TEMPLATE_CSV, parseRows, type RawRow,
} from "@/lib/importClientes";

type RowEstado = "nuevo" | "duplicado_exacto" | "actualizable" | "coincidencia_probable" | "error";
type Accion = "crear" | "actualizar" | "vincular" | "ignorar" | "revisar" | "error";

interface ResultRow {
  fila: number;
  nombre: string;
  empresa: string;
  telefono_normalizado: string;
  email: string;
  email_provisional: boolean;
  estado: RowEstado;
  accion_propuesta: Accion;
  accion_tomada?: Accion;
  motivo: string;
  cambios: string[];
  observaciones: string[];
  external_import_key: string;
  cliente_id: string | null;
  user_id: string | null;
  profile_id: string | null;
  coincide_con?: { id: string; empresa: string | null; contacto: string | null; email: string | null } | null;
  password_provisional?: string;
}

const ESTADO_LABEL: Record<RowEstado, string> = {
  nuevo: "Nuevo",
  duplicado_exacto: "Duplicado exacto",
  actualizable: "Actualizable",
  coincidencia_probable: "Posible duplicado",
  error: "Error",
};

const ESTADO_STYLE: Record<RowEstado, string> = {
  nuevo: "bg-success text-success-foreground",
  duplicado_exacto: "bg-muted text-muted-foreground",
  actualizable: "bg-info text-info-foreground",
  coincidencia_probable: "bg-warning text-warning-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export default function ImportarClientes() {
  const { hasRole } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [origen, setOrigen] = useState<"archivo" | "pegado">("pegado");
  const [rows, setRows] = useState<RawRow[]>([]);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [commitResults, setCommitResults] = useState<ResultRow[] | null>(null);
  const [decisiones, setDecisiones] = useState<Record<number, "vincular" | "actualizar" | "ignorar">>({});
  const [filtro, setFiltro] = useState<"todos" | RowEstado>("todos");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  const [incluirPasswords, setIncluirPasswords] = useState(false);
  const [verPassword, setVerPassword] = useState<Record<number, boolean>>({});

  if (!hasRole("super_admin")) return <Navigate to="/no-autorizado" replace />;

  const resetPreview = () => {
    setResults(null);
    setCommitResults(null);
    setDecisiones({});
  };

  const onFile = async (file: File) => {
    const content = await file.text();
    setTexto(content);
    setArchivo(file.name);
    setOrigen("archivo");
    resetPreview();
  };

  const descargarPlantilla = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validar = async () => {
    const parsed = parseRows(texto);
    if (parsed.rows.length === 0) {
      toast({ title: "Sin datos", description: "No se detectaron filas para importar.", variant: "destructive" });
      return;
    }
    setRows(parsed.rows);
    setLoading(true);
    setCommitResults(null);
    const { data, error } = await supabase.functions.invoke("import-clientes", {
      body: { mode: "dry_run", rows: parsed.rows, rules_version: RULES_VERSION, origen, archivo },
    });
    setLoading(false);
    if (error || (data as { error?: string })?.error) {
      toast({
        title: "Error al validar",
        description: (data as { error?: string })?.error ?? error?.message ?? "Error desconocido",
        variant: "destructive",
      });
      return;
    }
    const res = (data as { results: ResultRow[] }).results;
    setResults(res);
    setDecisiones(
      Object.fromEntries(
        res.filter((r) => r.estado === "coincidencia_probable").map((r) => [r.fila, "ignorar" as const]),
      ),
    );
  };

  const ejecutar = async (incluirActualizables: boolean) => {
    if (!results) return;
    setCommitting(true);
    const decisions = results.map((r) => {
      let accion: Accion = "ignorar";
      if (r.estado === "nuevo") accion = "crear";
      else if (r.estado === "actualizable" && incluirActualizables) accion = "actualizar";
      else if (r.estado === "coincidencia_probable") accion = decisiones[r.fila] ?? "ignorar";
      return { fila: r.fila, estado_preview: r.estado, accion, cliente_id: r.cliente_id };
    });

    // La creación de cuentas es lenta (hash de contraseña + varias escrituras por
    // fila). Enviamos el commit en lotes pequeños y secuenciales para no superar
    // el límite de 150s de la edge function.
    const CHUNK = 20;
    const acumulado: ResultRow[] = [];
    const resumen: Record<string, number> = {
      creados: 0, actualizados: 0, vinculados: 0, omitidos: 0, errores: 0,
    };

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunkRows = rows.slice(i, i + CHUNK);
      const filas = new Set(chunkRows.map((r) => r.fila));
      const chunkDecisions = decisions.filter((d) => filas.has(d.fila));
      setProgreso({ hechas: i, total: rows.length });

      const { data, error } = await supabase.functions.invoke("import-clientes", {
        body: {
          mode: "commit",
          rows: chunkRows,
          decisions: chunkDecisions,
          rules_version: RULES_VERSION,
          origen,
          archivo,
        },
      });

      if (error || (data as { error?: string })?.error) {
        setCommitting(false);
        setProgreso(null);
        if (acumulado.length > 0) setCommitResults(acumulado);
        toast({
          title: "Error al importar",
          description:
            ((data as { error?: string })?.error ?? error?.message ?? "Error desconocido") +
            (acumulado.length > 0 ? ` · Se procesaron ${acumulado.length} filas antes del error.` : ""),
          variant: "destructive",
        });
        return;
      }

      acumulado.push(...(data as { results: ResultRow[] }).results);
      const r = (data as { resumen: Record<string, number> }).resumen;
      Object.keys(resumen).forEach((k) => (resumen[k] += r?.[k] ?? 0));
    }

    setProgreso(null);
    setCommitting(false);
    setCommitResults(acumulado);
    toast({
      title: "Importación finalizada",
      description: `${resumen.creados} creados · ${resumen.actualizados} actualizados · ${resumen.vinculados} vinculados · ${resumen.errores} errores`,
    });
  };


  const activos = commitResults ?? results;

  const conteos = useMemo(() => {
    const base: Record<string, number> = { todos: activos?.length ?? 0 };
    (activos ?? []).forEach((r) => {
      base[r.estado] = (base[r.estado] ?? 0) + 1;
    });
    return base;
  }, [activos]);

  const visibles = (activos ?? []).filter((r) => filtro === "todos" || r.estado === filtro);
  const revisiones = (results ?? []).filter((r) => r.estado === "coincidencia_probable");

  const reporteCSV = () => {
    const rowsOut = commitResults ?? results ?? [];
    const headers = [
      "fila", "nombre", "empresa", "telefono", "email", "email_provisional", "estado",
      "accion", "motivo", "observaciones", "clave_importacion", "user_id", "cliente_id",
      ...(incluirPasswords ? ["password_provisional"] : []),
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rowsOut.map((r) =>
      [
        r.fila, r.nombre, r.empresa, r.telefono_normalizado, r.email, r.email_provisional,
        r.estado, r.accion_tomada ?? r.accion_propuesta, r.motivo, r.observaciones.join(" · "),
        r.external_import_key, r.user_id ?? "", r.cliente_id ?? "",
        ...(incluirPasswords ? [r.password_provisional ?? ""] : []),
      ].map(escape).join(","),
    );
    return [headers.join(","), ...lines].join("\n");
  };

  const descargarReporte = () => {
    const blob = new Blob([reporteCSV()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-importacion-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="industrial-title text-3xl">Importar clientes</h1>
        <p className="text-sm text-muted-foreground">
          Alta masiva desde CSV o tabla pegada. Exclusivo de super administrador.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1 · Cargar datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={origen === "archivo" ? "archivo" : "pegado"}
            onValueChange={(v) => setOrigen(v as "archivo" | "pegado")}
          >
            <TabsList>
              <TabsTrigger value="archivo">Subir CSV</TabsTrigger>
              <TabsTrigger value="pegado">Pegar tabla</TabsTrigger>
            </TabsList>
            <TabsContent value="archivo" className="space-y-3 pt-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Seleccionar archivo
              </Button>
              {archivo && <p className="text-sm text-muted-foreground">Archivo: {archivo}</p>}
            </TabsContent>
            <TabsContent value="pegado" className="pt-3">
              <Textarea
                rows={8}
                placeholder="Pega aquí las filas copiadas desde Excel o Google Sheets…"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setArchivo(null);
                  resetPreview();
                }}
                className="font-mono text-xs"
              />
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={descargarPlantilla}>
              <Download className="mr-2 h-4 w-4" /> Descargar plantilla CSV
            </Button>
            <Button onClick={validar} disabled={loading || !texto.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Validar archivo
            </Button>
          </div>
        </CardContent>
      </Card>

      {activos && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · Resultado de la validación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["todos", "nuevo", "actualizable", "coincidencia_probable", "duplicado_exacto", "error"] as const).map(
                  (f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filtro === f ? "default" : "outline"}
                      onClick={() => setFiltro(f)}
                    >
                      {f === "todos" ? "Todos" : ESTADO_LABEL[f]} ({conteos[f] ?? 0})
                    </Button>
                  ),
                )}
              </div>

              <div className="space-y-2">
                {visibles.map((r) => (
                  <div key={r.fila} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Fila {r.fila}</span>
                      <span className="font-semibold">{r.nombre || r.empresa || "—"}</span>
                      <Badge className={ESTADO_STYLE[r.estado] + " border-0"}>
                        {ESTADO_LABEL[r.estado]}
                      </Badge>
                      {r.accion_tomada && (
                        <Badge variant="outline" className="text-xs">
                          Acción: {r.accion_tomada}
                        </Badge>
                      )}
                      {r.email_provisional && (
                        <Badge variant="outline" className="text-xs">Email provisional</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.email} · {r.telefono_normalizado || "sin teléfono"} · clave {r.external_import_key || "—"}
                    </p>
                    <p className="text-xs">{r.motivo}</p>
                    {r.coincide_con && (
                      <p className="text-xs text-muted-foreground">
                        Coincide con: {r.coincide_con.empresa ?? r.coincide_con.contacto} ({r.coincide_con.email ?? "sin email"})
                      </p>
                    )}
                    {r.cambios.length > 0 && (
                      <p className="text-xs text-muted-foreground">Cambios: {r.cambios.join(", ")}</p>
                    )}
                    {r.observaciones.length > 0 && (
                      <p className="text-xs text-warning-foreground/80">{r.observaciones.join(" · ")}</p>
                    )}
                    {r.password_provisional && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">Contraseña temporal:</span>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs">
                          {verPassword[r.fila] ? r.password_provisional : "••••••••"}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setVerPassword((p) => ({ ...p, [r.fila]: !p[r.fila] }))}
                        >
                          {verPassword[r.fila] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {visibles.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin filas en esta categoría.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {!commitResults && revisiones.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Revisión manual ({revisiones.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Estas filas se parecen a clientes existentes. Elige qué hacer con cada una. Si crees que es un
                  cliente distinto, ignórala aquí y créala manualmente desde Clientes.
                </p>
                {revisiones.map((r) => (
                  <div key={r.fila} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div className="text-sm">
                      <p className="font-semibold">{r.nombre || r.empresa}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.motivo} → {r.coincide_con?.empresa ?? r.coincide_con?.contacto ?? "—"}
                      </p>
                    </div>
                    <Select
                      value={decisiones[r.fila] ?? "ignorar"}
                      onValueChange={(v) =>
                        setDecisiones((d) => ({ ...d, [r.fila]: v as "vincular" | "actualizar" | "ignorar" }))
                      }
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vincular">Vincular a existente</SelectItem>
                        <SelectItem value="actualizar">Actualizar existente</SelectItem>
                        <SelectItem value="ignorar">Ignorar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3 · Ejecutar e informar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Contraseñas provisionales</AlertTitle>
                <AlertDescription className="text-xs">
                  Las cuentas nuevas reciben una contraseña temporal que debe cambiarse en el primer acceso
                  (desde “¿Olvidaste tu contraseña?”). Se muestran ocultas y solo se incluyen en el reporte si lo
                  marcas expresamente. No las compartas por canales públicos.
                </AlertDescription>
              </Alert>

              {!commitResults && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => ejecutar(false)} disabled={committing}>
                    {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Importar solo nuevos
                  </Button>
                  <Button variant="outline" onClick={() => ejecutar(true)} disabled={committing}>
                    Importar nuevos y actualizar
                  </Button>
                </div>
              )}

              {progreso && (
                <p className="text-sm text-muted-foreground">
                  Procesando en lotes: {progreso.hechas} de {progreso.total} filas…
                </p>
              )}


              <div className="flex items-center gap-2">
                <Checkbox
                  id="incluir-pass"
                  checked={incluirPasswords}
                  onCheckedChange={(v) => setIncluirPasswords(v === true)}
                />
                <label htmlFor="incluir-pass" className="text-xs text-muted-foreground">
                  Incluir contraseñas provisionales en el reporte descargado
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(reporteCSV());
                    toast({ title: "Reporte copiado" });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copiar reporte
                </Button>
                <Button variant="outline" size="sm" onClick={descargarReporte}>
                  <Download className="mr-2 h-4 w-4" /> Descargar reporte CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
