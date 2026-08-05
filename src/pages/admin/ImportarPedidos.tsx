import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, Loader2, ChevronDown, AlertTriangle, CheckCircle2,
  Download, ClipboardList, Package,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import {
  PEDIDOS_RULES_VERSION, PEDIDOS_TEMPLATE_CSV, parsePedidoRows, construirDryRun,
  pedidoTieneErrores, type CatalogoProducto, type ClienteRef, type DryRunResultado,
  type RawPedidoRow,
} from "@/lib/importPedidos";

const CHUNK = 10;

export default function ImportarPedidos() {
  const { user } = useAuth();
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [analizando, setAnalizando] = useState(false);

  const [rows, setRows] = useState<RawPedidoRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoProducto[]>([]);
  const [rowKeys, setRowKeys] = useState<Set<string>>(new Set());
  const [mapeoManual, setMapeoManual] = useState<Record<string, string>>({});
  const [dry, setDry] = useState<DryRunResultado | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState<
    { pedidos: number; lineas: number; errores: number; pendientes: number; omitidos: number } | null
  >(null);

  /* ---------------- carga de referencias ---------------- */

  const cargarReferencias = useCallback(async () => {
    const [cli, prod, existentes, alias] = await Promise.all([
      supabase
        .from("clientes")
        .select("id,empresa,codigo_cliente_externo,external_import_key,telefono_normalizado,email")
        .limit(5000),
      supabase.from("productos").select("id,sku,nombre,presentaciones").eq("activo", true).limit(2000),
      supabase.from("pedidos").select("import_row_key").not("import_row_key", "is", null).limit(10000),
      supabase.from("cliente_codigos_alias").select("cliente_id,codigo").eq("activo", true).limit(5000),
    ]);
    if (cli.error) toast.error("No se pudieron cargar los clientes: " + cli.error.message);
    if (prod.error) toast.error("No se pudo cargar el catálogo: " + prod.error.message);
    const aliasPorCliente = new Map<string, string[]>();
    ((alias.data ?? []) as { cliente_id: string; codigo: string }[]).forEach((a) => {
      const arr = aliasPorCliente.get(a.cliente_id) ?? [];
      arr.push(a.codigo);
      aliasPorCliente.set(a.cliente_id, arr);
    });
    setClientes(
      ((cli.data ?? []) as ClienteRef[]).map((c) => ({
        ...c,
        codigos_alias: aliasPorCliente.get(c.id) ?? [],
      })),
    );
    setCatalogo((prod.data ?? []) as CatalogoProducto[]);
    setRowKeys(new Set(((existentes.data ?? []) as { import_row_key: string | null }[])
      .map((r) => r.import_row_key)
      .filter((k): k is string => !!k)));
  }, []);


  useEffect(() => {
    cargarReferencias();
  }, [cargarReferencias]);

  /* ---------------- entrada de datos ---------------- */

  const onArchivo = async (file: File | null) => {
    if (!file) return;
    setLeyendo(true);
    try {
      const esExcel = /\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name);
      let content = "";
      if (esExcel) {
        const XLSX = await import("xlsx");
        const buf = new Uint8Array(await file.arrayBuffer());
        const wb = XLSX.read(buf, { type: "array", cellDates: false, cellText: true });
        const hoja =
          wb.SheetNames.find((n) => /pedidos?_?histor/i.test(n)) ?? wb.SheetNames[0];
        content = XLSX.utils.sheet_to_csv(wb.Sheets[hoja], { FS: ",", blankrows: false, rawNumbers: false });
      } else {
        content = await file.text();
      }
      setTexto(content);
      setArchivo(file.name);
      setDry(null);
      setResumen(null);
    } catch (e) {
      toast.error("No se pudo leer el archivo: " + (e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  const analizar = async () => {
    if (!texto.trim()) return toast.error("Pegá el CSV o subí el archivo primero.");
    setAnalizando(true);
    const { rows: parsed, headerFound } = parsePedidoRows(texto);
    if (parsed.length === 0) {
      setAnalizando(false);
      return toast.error("No se detectaron filas de datos.");
    }
    if (!headerFound) toast.warning("No se reconoció la fila de encabezados: se asumió el orden estándar de columnas.");
    await cargarReferencias();
    setRows(parsed);
    setMapeoManual({});
    setResumen(null);
    setAnalizando(false);
  };

  useEffect(() => {
    if (rows.length === 0) {
      setDry(null);
      return;
    }
    setDry(construirDryRun({ rows, clientes, catalogo, rowKeysExistentes: rowKeys, mapeoManual }));
  }, [rows, clientes, catalogo, rowKeys, mapeoManual]);

  /* ---------------- métricas del dry-run ---------------- */

  const m = useMemo(() => {
    if (!dry) return null;
    const validos = dry.pedidos.filter((p) => !pedidoTieneErrores(p) && !p.ya_importado);
    const conError = dry.pedidos.filter((p) => pedidoTieneErrores(p));
    const duplicados = dry.pedidos.filter((p) => p.ya_importado && !pedidoTieneErrores(p));
    return {
      validos,
      conError,
      duplicados,
      lineasValidas: validos.reduce((a, p) => a + p.lineas.length, 0),
      clientesUnicos: new Set(validos.map((p) => p.cliente_id)).size,
    };
  }, [dry]);

  /* ---------------- importación real ---------------- */

  const importar = async () => {
    if (!dry || !m || !user) return;
    setConfirmando(false);
    setImportando(true);
    setProgreso(0);

    let pedidosCreados = 0;
    let lineasCreadas = 0;
    const fallos: Array<{ id_unificado: string; fila_venta: string; motivo: string }> = [];

    const lote = m.validos;
    for (let i = 0; i < lote.length; i += CHUNK) {
      const bloque = lote.slice(i, i + CHUNK);
      for (const p of bloque) {
        const { data: pedido, error } = await supabase
          .from("pedidos")
          .insert({
            cliente_id: p.cliente_id!,
            creado_por: user.id,
            estado: "entregado",
            total: p.total,
            notas: `Pedido histórico importado (venta ${p.fila_venta} · ${p.fecha_texto})`,
            created_at: p.fecha ?? undefined,
            origen_importacion: "historico",
            import_row_key: p.row_key,
          })
          .select("id")
          .maybeSingle();

        if (error || !pedido) {
          fallos.push({
            id_unificado: p.id_unificado,
            fila_venta: p.fila_venta,
            motivo: error?.message ?? "No se pudo crear el pedido",
          });
          continue;
        }

        const items = p.lineas.map((l) => ({
          pedido_id: pedido.id,
          producto_id: l.producto_id!,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          presentacion: l.presentacion,
        }));
        const { error: errItems } = await supabase.from("pedido_items").insert(items);
        if (errItems) {
          await supabase.from("pedidos").delete().eq("id", pedido.id);
          fallos.push({
            id_unificado: p.id_unificado,
            fila_venta: p.fila_venta,
            motivo: "Ítems: " + errItems.message,
          });
          continue;
        }
        pedidosCreados++;
        lineasCreadas += items.length;
      }
      setProgreso(Math.min(100, Math.round(((i + bloque.length) / lote.length) * 100)));
    }

    const res = {
      pedidos: pedidosCreados,
      lineas: lineasCreadas,
      errores: m.conError.length + fallos.length,
      pendientes: dry.pendientes.length,
      omitidos: m.duplicados.length,
    };

    const { error: errBatch } = await supabase.from("import_pedidos_batches").insert({
      user_id: user.id,
      origen: archivo ? "archivo" : "pegado",
      archivo: archivo,
      total_filas: dry.totalFilas,
      pedidos_creados: res.pedidos,
      lineas_creadas: res.lineas,
      pendientes: res.pendientes,
      omitidos: res.omitidos,
      errores: res.errores,
      detalle: {
        rules_version: PEDIDOS_RULES_VERSION,
        filas_incluidas: dry.filasIncluidas,
        pedidos_con_error: m.conError.map((p) => ({
          id_unificado: p.id_unificado,
          fila_venta: p.fila_venta,
          errores: [...p.errores, ...p.lineas.flatMap((l) => l.errores)],
        })),
        fallos_insercion: fallos,
        pendientes_revision: dry.pendientes,
      } as never,
    });
    if (errBatch) toast.error("El log del lote no se pudo guardar: " + errBatch.message);

    await logAudit("importar_pedidos_historicos", "pedidos", undefined, {
      pedidos_creados: res.pedidos,
      lineas_creadas: res.lineas,
      errores: res.errores,
      pendientes: res.pendientes,
      omitidos: res.omitidos,
      archivo,
    });

    setImportando(false);
    setResumen(res);
    await cargarReferencias();
    toast.success(`Importación completada: ${res.pedidos} pedidos y ${res.lineas} líneas.`);
  };

  const descargarPendientes = () => {
    if (!dry) return;
    const headers = ["fila", "fila_venta", "fecha", "id_unificado", "estado_coincide", "nombre_tienda", "producto", "cantidad", "total_venta_bs", "motivo"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [
      ...dry.pendientes.map((p) => [p.fila, p.fila_venta, p.fecha_texto, p.id_unificado, p.estado_coincide, p.nombre_tienda, p.producto_texto, p.cantidad, p.total_texto, p.motivo]),
      ...(m?.conError ?? []).flatMap((p) =>
        p.lineas.map((l) => [l.fila, p.fila_venta, p.fecha_texto, p.id_unificado, "", p.cliente_empresa ?? "", l.producto_texto, l.cantidad, l.total_linea, [...p.errores, ...l.errores].join(" · ")]),
      ),
    ];
    const csv = [headers.join(","), ...filas.map((f) => f.map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-historicos-revision-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-6">
      <div>
        <h1 className="industrial-title text-2xl">Importar pedidos históricos</h1>
        <p className="text-sm text-muted-foreground">
          Carga interna de ventas anteriores en formato largo (una fila por producto).
          No dispara ninguna notificación a clientes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="industrial-title text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-brand" /> 1 · Cargar datos
          </CardTitle>
          <CardDescription>
            Columnas esperadas: fila_venta, fecha, id_unificado, estado_coincide, ciudad, zona,
            direccion, nombre, nombre_tienda, contacto, celular, producto, cantidad,
            total_venta_bs, incluir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="archivo-pedidos">Archivo Excel o CSV</Label>
              <Input
                id="archivo-pedidos"
                type="file"
                accept=".csv,.txt,.xlsx,.xlsm,.xlsb,.xls"
                onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
                disabled={leyendo || importando}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([PEDIDOS_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "plantilla-pedidos-historicos.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Plantilla
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="csv-pedidos">…o pegá el contenido de la hoja</Label>
            <Textarea
              id="csv-pedidos"
              rows={6}
              className="font-mono text-xs"
              placeholder="fila_venta,fecha,id_unificado,…"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setArchivo(null);
                setDry(null);
                setResumen(null);
              }}
              disabled={importando}
            />
            {archivo && <p className="text-xs text-muted-foreground">Archivo cargado: {archivo}</p>}
          </div>

          <Button onClick={analizar} disabled={analizando || leyendo || importando}>
            {analizando || leyendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Analizar (dry-run)
          </Button>
        </CardContent>
      </Card>

      {dry && m && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="industrial-title text-lg flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-brand" /> 2 · Vista previa
              </CardTitle>
              <CardDescription>
                Nada se escribe en la base hasta que confirmes la importación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Metrica label="Filas leídas" valor={dry.totalFilas} />
                <Metrica label="Filas incluir=SI" valor={dry.filasIncluidas} />
                <Metrica label="Pedidos a crear" valor={m.validos.length} tono="ok" />
                <Metrica label="Líneas de detalle" valor={m.lineasValidas} />
                <Metrica label="Clientes vinculados" valor={m.clientesUnicos} />
                <Metrica label="Con error" valor={m.conError.length} tono={m.conError.length ? "error" : undefined} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metrica label="Pendientes de revisión (incluir=NO)" valor={dry.pendientes.length} tono="warn" />
                <Metrica label="Ya importados (se omiten)" valor={m.duplicados.length} />
                <Metrica label="Productos sin reconocer" valor={dry.productosSinReconocer.length} tono={dry.productosSinReconocer.length ? "warn" : undefined} />
              </div>

              {dry.productosSinReconocer.length > 0 && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" /> Vinculá manualmente los productos no reconocidos
                  </p>
                  {dry.productosSinReconocer.map((t) => (
                    <div key={t} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[220px] font-mono text-xs">{t}</span>
                      <Select
                        value={mapeoManual[t] ?? ""}
                        onValueChange={(v) => setMapeoManual((p) => ({ ...p, [t]: v }))}
                      >
                        <SelectTrigger className="w-[280px]"><SelectValue placeholder="Elegí el producto del catálogo" /></SelectTrigger>
                        <SelectContent>
                          {catalogo.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre}{p.sku ? ` · ${p.sku}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <ListaPedidos titulo={`Pedidos a crear (${m.validos.length})`} pedidos={m.validos} />
              {m.conError.length > 0 && (
                <ListaPedidos titulo={`Con error, no se importan (${m.conError.length})`} pedidos={m.conError} error />
              )}
              {m.duplicados.length > 0 && (
                <ListaPedidos titulo={`Ya importados previamente (${m.duplicados.length})`} pedidos={m.duplicados} />
              )}

              {dry.pendientes.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted/40">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Pendientes de revisión · incluir=NO ({dry.pendientes.length})
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 p-2 text-xs">
                    {dry.pendientes.map((p) => (
                      <div key={`${p.fila}-${p.producto_texto}`} className="rounded border p-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">fila {p.fila}</Badge>
                          <span className="font-medium">{p.nombre_tienda || "(sin nombre)"}</span>
                          <span className="text-muted-foreground">{p.fecha_texto}</span>
                          <span className="text-muted-foreground">{p.producto_texto} × {p.cantidad}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{p.motivo}</p>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setConfirmando(true)}
                  disabled={importando || m.validos.length === 0}
                >
                  {importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Confirmar importación ({m.validos.length} pedidos)
                </Button>
                <Button variant="outline" onClick={descargarPendientes} disabled={dry.pendientes.length + m.conError.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Exportar revisión
                </Button>
              </div>

              {importando && <Progress value={progreso} />}
            </CardContent>
          </Card>
        </>
      )}

      {resumen && (
        <Card>
          <CardHeader>
            <CardTitle className="industrial-title text-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> Resultado de la importación
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-5">
            <Metrica label="Pedidos creados" valor={resumen.pedidos} tono="ok" />
            <Metrica label="Líneas creadas" valor={resumen.lineas} />
            <Metrica label="Errores" valor={resumen.errores} tono={resumen.errores ? "error" : undefined} />
            <Metrica label="Pendientes" valor={resumen.pendientes} tono="warn" />
            <Metrica label="Omitidos (duplicados)" valor={resumen.omitidos} />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar importación histórica?</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán {m?.validos.length ?? 0} pedidos con {m?.lineasValidas ?? 0} líneas en estado
              “entregado”, con la fecha original de la venta. Las filas con incluir=NO y las que
              tienen errores quedan sin importar. No se envía ninguna notificación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={importar}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Metrica({ label, valor, tono }: { label: string; valor: number; tono?: "ok" | "warn" | "error" }) {
  const color =
    tono === "ok" ? "text-success" : tono === "warn" ? "text-warning" : tono === "error" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`industrial-title text-xl ${color}`}>{valor}</p>
    </div>
  );
}

function ListaPedidos({
  titulo,
  pedidos,
  error,
}: {
  titulo: string;
  pedidos: DryRunResultado["pedidos"];
  error?: boolean;
}) {
  if (pedidos.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted/40">
        <span className={`text-sm font-medium ${error ? "text-destructive" : ""}`}>{titulo}</span>
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 p-2">
        {pedidos.slice(0, 200).map((p) => (
          <div key={p.key} className="rounded-md border p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">venta {p.fila_venta}</Badge>
              <span className="text-muted-foreground">{p.fecha_texto}</span>
              <Badge variant="outline">{p.id_unificado || "sin código"}</Badge>
              <span className="font-medium">{p.cliente_empresa ?? "— sin cliente vinculado —"}</span>
              <span className="ml-auto industrial-title">Bs {p.total.toFixed(2)}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {p.lineas.map((l) => (
                <div key={`${l.fila}-${l.producto_texto}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {l.cantidad}× {l.producto_nombre}
                    {l.presentacion ? ` (${l.presentacion})` : ""}
                    <span className="text-muted-foreground"> · origen: {l.producto_texto}</span>
                  </span>
                  <span className="text-muted-foreground">Bs {l.total_linea.toFixed(2)} · unit. {l.precio_unitario.toFixed(2)}</span>
                </div>
              ))}
            </div>
            {(p.errores.length > 0 || p.lineas.some((l) => l.errores.length > 0)) && (
              <p className="mt-1 text-destructive">
                {[...p.errores, ...p.lineas.flatMap((l) => l.errores)].join(" · ")}
              </p>
            )}
            {p.ya_importado && <p className="mt-1 text-muted-foreground">Ya existe un pedido importado con esta clave.</p>}
          </div>
        ))}
        {pedidos.length > 200 && (
          <p className="text-xs text-muted-foreground">…y {pedidos.length - 200} más.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
