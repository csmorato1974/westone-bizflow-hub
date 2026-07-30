import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Download, History, Wrench, CheckCircle2, XCircle } from "lucide-react";
import { RULES_VERSION, type RawRow } from "@/lib/importClientes";

/* ------------------------------------------------------------------ */

type EstadoCaso = "pendiente" | "reintentado" | "resuelto" | "ignorado";

export interface Incidencia {
  id: string;
  batch_id: string | null;
  fila: number;
  datos_originales: Record<string, unknown>;
  datos_corregidos: Record<string, unknown> | null;
  estado: string;
  motivo: string;
  observaciones: string[];
  tipo_problema: string;
  identidad_key: string;
  external_import_key: string | null;
  user_id: string | null;
  profile_id: string | null;
  cliente_id: string | null;
  estado_caso: EstadoCaso;
  intentos: number;
  ultimo_intento: string | null;
  historial: Array<Record<string, unknown>>;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

const TIPO_LABEL: Record<string, string> = {
  error_de_formato: "Formato inválido",
  datos_incompletos: "Datos incompletos",
  duplicado_probable: "Posible duplicado",
  conflicto_desde_preview: "Cambió desde la validación",
  referencia_no_encontrada: "Referencia no encontrada",
  error_auth: "Error al crear la cuenta",
  error_profile: "Error en el perfil",
  error_cliente: "Error en la ficha",
  error_desconocido: "Error desconocido",
};

const CASO_STYLE: Record<EstadoCaso, string> = {
  pendiente: "bg-destructive text-destructive-foreground",
  reintentado: "bg-warning text-warning-foreground",
  resuelto: "bg-success text-success-foreground",
  ignorado: "bg-muted text-muted-foreground",
};

const CAMPOS: Array<{ key: keyof RawRow | string; label: string }> = [
  { key: "nombre", label: "Nombre de contacto" },
  { key: "empresa", label: "Empresa" },
  { key: "telefono", label: "Teléfono" },
  { key: "email", label: "Email" },
  { key: "direccion", label: "Dirección" },
  { key: "ciudad", label: "Ciudad" },
  { key: "vendedor_asignado", label: "Vendedor asignado" },
  { key: "lista_precio", label: "Lista de precios" },
  { key: "codigo_cliente_externo", label: "Código externo" },
  { key: "notas", label: "Notas" },
];

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/* ------------------------------------------------------------------ */

export default function ImportIncidencias() {
  const [items, setItems] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCaso, setFiltroCaso] = useState<"abiertos" | EstadoCaso | "todos">("abiertos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Incidencia | null>(null);
  const [historial, setHistorial] = useState<Incidencia | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("import_batch_issues")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast({ title: "Error al cargar incidencias", description: error.message, variant: "destructive" });
      return;
    }
    setItems((data ?? []) as unknown as Incidencia[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conteos = useMemo(() => {
    const base: Record<string, number> = { todos: items.length, abiertos: 0 };
    items.forEach((i) => {
      base[i.estado_caso] = (base[i.estado_caso] ?? 0) + 1;
      if (i.estado_caso === "pendiente" || i.estado_caso === "reintentado") base.abiertos++;
    });
    return base;
  }, [items]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (filtroCaso === "abiertos" && !["pendiente", "reintentado"].includes(i.estado_caso)) return false;
      if (filtroCaso !== "abiertos" && filtroCaso !== "todos" && i.estado_caso !== filtroCaso) return false;
      if (filtroTipo !== "todos" && i.tipo_problema !== filtroTipo) return false;
      if (!q) return true;
      const d = { ...i.datos_originales, ...(i.datos_corregidos ?? {}) };
      return [d.nombre, d.empresa, d.email, d.telefono, i.motivo, i.identidad_key]
        .map(texto)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, filtroCaso, filtroTipo, busqueda]);

  const marcar = async (i: Incidencia, estado_caso: EstadoCaso) => {
    const { data: auth } = await supabase.auth.getUser();
    const evento = {
      fecha: new Date().toISOString(),
      actor: auth.user?.id ?? null,
      accion: estado_caso === "ignorado" ? "descartado_manual" : "resuelto_manual",
      resultado: "ok",
      motivo: "",
    };
    const { error } = await supabase
      .from("import_batch_issues")
      .update({
        estado_caso,
        resuelto_por: auth.user?.id ?? null,
        resuelto_en: new Date().toISOString(),
        historial: [...(i.historial ?? []), evento] as unknown as never,
      })
      .eq("id", i.id);
    if (error) {
      toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: estado_caso === "ignorado" ? "Incidencia descartada" : "Incidencia marcada como resuelta" });
    cargar();
  };

  const exportarCSV = () => {
    const headers = [
      "fila", "estado_caso", "tipo_problema", "motivo", "intentos", "ultimo_intento",
      "nombre", "empresa", "telefono", "email", "identidad_key", "cliente_id", "user_id", "observaciones",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = visibles.map((i) => {
      const d = { ...i.datos_originales, ...(i.datos_corregidos ?? {}) } as Record<string, unknown>;
      return [
        i.fila, i.estado_caso, TIPO_LABEL[i.tipo_problema] ?? i.tipo_problema, i.motivo, i.intentos,
        i.ultimo_intento ?? "", d.nombre, d.empresa, d.telefono, d.email, i.identidad_key,
        i.cliente_id ?? "", i.user_id ?? "", (i.observaciones ?? []).join(" · "),
      ].map(esc).join(",");
    });
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incidencias-importacion-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Pendientes de revisión
            {conteos.abiertos > 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground">{conteos.abiertos}</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCSV} disabled={visibles.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Cada fila que falló en la validación o en la importación queda aquí registrada hasta que se corrige,
          se resuelve o se descarta.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select value={filtroCaso} onValueChange={(v) => setFiltroCaso(v as typeof filtroCaso)}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abiertos">Abiertos ({conteos.abiertos ?? 0})</SelectItem>
              <SelectItem value="pendiente">Pendientes ({conteos.pendiente ?? 0})</SelectItem>
              <SelectItem value="reintentado">Reintentados ({conteos.reintentado ?? 0})</SelectItem>
              <SelectItem value="resuelto">Resueltos ({conteos.resuelto ?? 0})</SelectItem>
              <SelectItem value="ignorado">Descartados ({conteos.ignorado ?? 0})</SelectItem>
              <SelectItem value="todos">Todos ({conteos.todos})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los motivos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-[240px]"
            placeholder="Buscar por nombre, empresa o email"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {visibles.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {loading ? "Cargando…" : "No hay incidencias con estos filtros."}
          </p>
        ) : (
          <div className="space-y-2">
            {visibles.map((i) => {
              const d = { ...i.datos_originales, ...(i.datos_corregidos ?? {}) } as Record<string, unknown>;
              const abierto = i.estado_caso === "pendiente" || i.estado_caso === "reintentado";
              return (
                <div key={i.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{texto(d.nombre) || "(sin nombre)"}</span>
                        {d.empresa ? (
                          <span className="text-sm text-muted-foreground">· {texto(d.empresa)}</span>
                        ) : null}
                        <Badge className={CASO_STYLE[i.estado_caso]}>{i.estado_caso}</Badge>
                        <Badge variant="outline">{TIPO_LABEL[i.tipo_problema] ?? i.tipo_problema}</Badge>
                        <Badge variant="outline">fila {i.fila}</Badge>
                        {i.intentos > 0 && <Badge variant="outline">{i.intentos} intento(s)</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground break-words">
                        {i.motivo || "Sin motivo registrado"}
                      </p>
                      {(i.observaciones ?? []).length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground break-words">
                          {i.observaciones.join(" · ")}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground break-all">
                        {texto(d.email)} {d.telefono ? `· ${texto(d.telefono)}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setHistorial(i)}>
                        <History className="mr-2 h-4 w-4" /> Historial
                      </Button>
                      {abierto && (
                        <>
                          <Button size="sm" onClick={() => setEditando(i)}>
                            <Wrench className="mr-2 h-4 w-4" /> Corregir y reintentar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => marcar(i, "resuelto")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Resuelta
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => marcar(i, "ignorado")}>
                            <XCircle className="mr-2 h-4 w-4" /> Descartar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {editando && (
        <EditarIncidencia
          incidencia={editando}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}

      <Dialog open={!!historial} onOpenChange={(o) => !o && setHistorial(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de la incidencia</DialogTitle>
            <DialogDescription>Fila {historial?.fila} · {historial?.identidad_key}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {(historial?.historial ?? []).length === 0 && (
              <p className="text-muted-foreground">Sin eventos registrados.</p>
            )}
            {(historial?.historial ?? []).map((h, idx) => (
              <div key={idx} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{texto(h.accion)}</span>
                  <Badge variant="outline">{texto(h.resultado)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {texto(h.fecha) && new Date(texto(h.fecha)).toLocaleString()}
                </p>
                {texto(h.motivo) && <p className="mt-1 break-words">{texto(h.motivo)}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function EditarIncidencia({
  incidencia,
  onClose,
  onDone,
}: {
  incidencia: Incidencia;
  onClose: () => void;
  onDone: () => void;
}) {
  const inicial = { ...incidencia.datos_originales, ...(incidencia.datos_corregidos ?? {}) } as Record<string, unknown>;
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.key as string, texto(inicial[c.key as string])])),
  );
  const [accion, setAccion] = useState<"crear" | "actualizar" | "vincular" | "ignorar">(
    incidencia.cliente_id ? "actualizar" : "crear",
  );
  const [notas, setNotas] = useState(incidencia.notas ?? "");
  const [enviando, setEnviando] = useState(false);

  const reintentar = async () => {
    setEnviando(true);
    const row: RawRow = { fila: incidencia.fila, ...form } as unknown as RawRow;
    const { data, error } = await supabase.functions.invoke("import-clientes", {
      body: {
        mode: "retry_issue",
        issue_id: incidencia.id,
        accion,
        cliente_id: incidencia.cliente_id,
        rows: [row],
        rules_version: RULES_VERSION,
      },
    });

    if (notas !== (incidencia.notas ?? "")) {
      await supabase.from("import_batch_issues").update({ notas }).eq("id", incidencia.id);
    }
    setEnviando(false);

    const err = (data as { error?: string })?.error ?? error?.message;
    if (err) {
      toast({ title: "No se pudo reintentar", description: err, variant: "destructive" });
      return;
    }
    const ok = (data as { ok?: boolean })?.ok;
    const res = (data as { result?: { motivo?: string } })?.result;
    toast({
      title: ok ? "Fila corregida e importada" : "El reintento volvió a fallar",
      description: ok ? "La incidencia se marcó como resuelta." : res?.motivo ?? "Revisa los datos e inténtalo de nuevo.",
      variant: ok ? "default" : "destructive",
    });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corregir fila {incidencia.fila}</DialogTitle>
          <DialogDescription>
            {TIPO_LABEL[incidencia.tipo_problema] ?? incidencia.tipo_problema} · {incidencia.motivo}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <div key={c.key as string} className="space-y-1">
              <Label htmlFor={`f-${c.key as string}`}>{c.label}</Label>
              <Input
                id={`f-${c.key as string}`}
                value={form[c.key as string] ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, [c.key as string]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <Label>Acción al reintentar</Label>
          <Select value={accion} onValueChange={(v) => setAccion(v as typeof accion)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="crear">Crear cliente nuevo</SelectItem>
              <SelectItem value="actualizar" disabled={!incidencia.cliente_id}>
                Actualizar la ficha existente
              </SelectItem>
              <SelectItem value="vincular" disabled={!incidencia.cliente_id}>
                Vincular con la ficha existente
              </SelectItem>
              <SelectItem value="ignorar">No importar (descartar)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notas-incidencia">Notas internas</Label>
          <Textarea
            id="notas-incidencia"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Contexto de la corrección aplicada"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={reintentar} disabled={enviando}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reintentar importación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
