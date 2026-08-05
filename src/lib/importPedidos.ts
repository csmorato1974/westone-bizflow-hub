/**
 * Reglas de parseo, normalización y agrupación para la importación de
 * PEDIDOS HISTÓRICOS (hoja "CSV_Pedidos_Historicos", formato largo:
 * una fila por producto vendido).
 *
 * Toda la lógica es determinista y vive en el cliente: la escritura final la
 * hace el admin autenticado con sus propios permisos (RLS de pedidos).
 */

import { parseDelimited, normalizeText, similarity, stableHash } from "@/lib/importClientes";

export const PEDIDOS_RULES_VERSION = "1.0.0";

export const PEDIDOS_HEADERS = [
  "fila_venta",
  "fecha",
  "id_unificado",
  "estado_coincide",
  "ciudad",
  "zona",
  "direccion",
  "nombre",
  "nombre_tienda",
  "contacto",
  "celular",
  "producto",
  "cantidad",
  "total_venta_bs",
  "incluir",
] as const;

export type PedidoHeader = (typeof PEDIDOS_HEADERS)[number];

export type RawPedidoRow = Record<PedidoHeader, string> & { fila: number };

const ALIASES: Record<string, PedidoHeader> = {
  fila_venta: "fila_venta",
  filaventa: "fila_venta",
  venta: "fila_venta",
  fecha: "fecha",
  id_unificado: "id_unificado",
  idunificado: "id_unificado",
  id: "id_unificado",
  cliente_id_unificado: "id_unificado",
  estado_coincide: "estado_coincide",
  estadocoincide: "estado_coincide",
  estado: "estado_coincide",
  ciudad: "ciudad",
  zona: "zona",
  direccion: "direccion",
  nombre: "nombre",
  nombre_tienda: "nombre_tienda",
  nombretienda: "nombre_tienda",
  tienda: "nombre_tienda",
  contacto: "contacto",
  celular: "celular",
  telefono: "celular",
  producto: "producto",
  productos: "producto",
  cantidad: "cantidad",
  cant: "cantidad",
  total_venta_bs: "total_venta_bs",
  totalventabs: "total_venta_bs",
  total: "total_venta_bs",
  total_bs: "total_venta_bs",
  incluir: "incluir",
};

const headerKey = (raw: string) =>
  normalizeText(raw).replace(/\s+/g, "_").replace(/^_+|_+$/g, "");

function mapHeaderRow(cells: string[]): (PedidoHeader | undefined)[] {
  return cells.map((c) => {
    const k = headerKey(c);
    return ALIASES[k] ?? ALIASES[k.replace(/_/g, "")] ?? undefined;
  });
}

function emptyRow(fila: number): RawPedidoRow {
  const base = { fila } as RawPedidoRow;
  PEDIDOS_HEADERS.forEach((h) => {
    base[h] = "";
  });
  return base;
}

export function parsePedidoRows(text: string): {
  rows: RawPedidoRow[];
  headerFound: boolean;
} {
  const table = parseDelimited(text);
  if (table.length === 0) return { rows: [], headerFound: false };

  let headerIndex = -1;
  let mapped: (PedidoHeader | undefined)[] = [];
  const limite = Math.min(table.length, 10);
  for (let i = 0; i < limite; i++) {
    const candidato = mapHeaderRow(table[i]);
    if (candidato.filter(Boolean).length >= 4) {
      headerIndex = i;
      mapped = candidato;
      break;
    }
  }

  const headerFound = headerIndex >= 0;
  const dataRows = headerFound ? table.slice(headerIndex + 1) : table;

  const rows = dataRows.map((cells, idx) => {
    const row = emptyRow(idx + 1);
    cells.forEach((cell, i) => {
      const key = headerFound ? mapped[i] : PEDIDOS_HEADERS[i];
      if (!key) return;
      const valor = (cell ?? "").trim();
      if (!valor) return;
      row[key] = valor;
    });
    return row;
  });

  return {
    rows: rows.filter((r) =>
      PEDIDOS_HEADERS.some((h) => (r[h] ?? "") !== ""),
    ),
    headerFound,
  };
}

/* ------------------------------------------------------------------ */
/* Normalización de valores                                            */
/* ------------------------------------------------------------------ */

export function parseNumero(value: string): number | null {
  const limpio = (value ?? "")
    .replace(/[^\d,.\-]/g, "")
    .trim();
  if (!limpio) return null;
  // Si hay coma y punto, la coma es separador de miles (formato es-BO habitual).
  let normal = limpio;
  if (limpio.includes(",") && limpio.includes(".")) {
    normal = limpio.replace(/,/g, "");
  } else if (limpio.includes(",")) {
    normal = limpio.replace(",", ".");
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Devuelve fecha ISO (medianoche local) o null si no se puede interpretar. */
export function parseFecha(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;

  // dd/mm/yyyy o dd-mm-yyyy
  const m1 = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]);
    let y = Number(m1[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    if (!Number.isNaN(dt.getTime()) && dt.getMonth() === mo - 1) return dt.toISOString();
  }

  // yyyy-mm-dd (o ISO completo)
  const m2 = v.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m2) {
    const dt = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 12, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function esIncluir(value: string): boolean {
  const v = normalizeText(value);
  return v === "si" || v === "s" || v === "yes" || v === "true" || v === "1";
}

export function normalizarIdUnificado(value: string): string {
  return (value ?? "").trim().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Coincidencia de productos (texto libre)                             */
/* ------------------------------------------------------------------ */

export interface CatalogoProducto {
  id: string;
  sku: string | null;
  nombre: string;
  presentaciones: string[] | null;
}

export interface MatchProducto {
  producto_id: string | null;
  producto_nombre: string;
  presentacion: string | null;
  score: number;
}

const PRESENTACION_RE = /(\d+(?:[.,]\d+)?)\s*(l|lt|lts|litros?|ml|kg|gr?)\b/i;

/** Extrae la presentación del texto libre y devuelve el resto como nombre. */
export function separarPresentacion(texto: string): { nombre: string; presentacion: string | null } {
  const t = (texto ?? "").trim();
  const m = t.match(PRESENTACION_RE);
  if (!m) return { nombre: t, presentacion: null };
  const cantidad = m[1].replace(",", ".").replace(/\.0$/, "");
  const unidadRaw = m[2].toLowerCase();
  const unidad = unidadRaw.startsWith("l") ? "L" : unidadRaw.toUpperCase();
  const nombre = (t.slice(0, m.index ?? 0) + " " + t.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { nombre, presentacion: `${cantidad}${unidad}` };
}

/** Presentación del catálogo más parecida a la detectada. */
function ajustarPresentacion(det: string | null, disponibles: string[] | null): string | null {
  if (!det) return null;
  const lista = (disponibles ?? []).map((p) => p.trim()).filter(Boolean);
  if (lista.length === 0) return det;
  const exacto = lista.find((p) => p.toLowerCase() === det.toLowerCase());
  if (exacto) return exacto;
  const numDet = parseNumero(det);
  const porNumero = lista.find((p) => parseNumero(p) === numDet);
  return porNumero ?? det;
}

/**
 * Vincula un texto libre de producto con el catálogo.
 * Devuelve score 0 cuando no hay una coincidencia razonable.
 */
export function matchProducto(texto: string, catalogo: CatalogoProducto[]): MatchProducto {
  const { nombre, presentacion } = separarPresentacion(texto);
  const objetivo = normalizeText(nombre);
  const objetivoCompleto = normalizeText(texto);

  let mejor: CatalogoProducto | null = null;
  let mejorScore = 0;

  for (const p of catalogo) {
    const nom = normalizeText(p.nombre);
    const sku = normalizeText(p.sku ?? "");
    let score = 0;

    if (objetivo && nom === objetivo) score = 1;
    else if (sku && (objetivoCompleto === sku || objetivoCompleto.includes(sku))) score = 0.97;
    else if (objetivo && (nom.includes(objetivo) || objetivo.includes(nom))) {
      score = 0.9 * (Math.min(nom.length, objetivo.length) / Math.max(nom.length, objetivo.length));
      score = Math.max(score, 0.8);
    } else {
      score = similarity(objetivo, nom);
      // Bonus por tokens compartidos (ej. "supercoolant" + "red").
      const to = new Set(objetivo.split(" ").filter(Boolean));
      const tn = nom.split(" ").filter(Boolean);
      if (tn.length > 0) {
        const compartidos = tn.filter((t) => to.has(t)).length / tn.length;
        score = Math.max(score, compartidos * 0.85);
      }
    }

    if (score > mejorScore) {
      mejorScore = score;
      mejor = p;
    }
  }

  if (!mejor || mejorScore < 0.72) {
    return { producto_id: null, producto_nombre: nombre || texto, presentacion, score: mejorScore };
  }

  return {
    producto_id: mejor.id,
    producto_nombre: mejor.nombre,
    presentacion: ajustarPresentacion(presentacion, mejor.presentaciones),
    score: mejorScore,
  };
}

/* ------------------------------------------------------------------ */
/* Agrupación en pedidos                                               */
/* ------------------------------------------------------------------ */

export interface LineaPreview {
  fila: number;
  producto_texto: string;
  producto_id: string | null;
  producto_nombre: string;
  presentacion: string | null;
  cantidad: number;
  total_linea: number;
  precio_unitario: number;
  errores: string[];
}

export interface PedidoPreview {
  key: string;
  row_key: string;
  fila_venta: string;
  fecha: string | null;
  fecha_texto: string;
  id_unificado: string;
  cliente_id: string | null;
  cliente_empresa: string | null;
  lineas: LineaPreview[];
  total: number;
  errores: string[];
  ya_importado: boolean;
}

export interface PendientePreview {
  fila: number;
  fila_venta: string;
  fecha_texto: string;
  id_unificado: string;
  estado_coincide: string;
  nombre_tienda: string;
  producto_texto: string;
  cantidad: string;
  total_texto: string;
  motivo: string;
}

export interface DryRunResultado {
  pedidos: PedidoPreview[];
  pendientes: PendientePreview[];
  productosSinReconocer: string[];
  totalFilas: number;
  filasIncluidas: number;
}

export interface ClienteRef {
  id: string;
  empresa: string | null;
  codigo_cliente_externo: string | null;
  /** Códigos históricos (alias) del cliente. */
  codigos_alias?: string[];
  external_import_key?: string | null;
  telefono_normalizado?: string | null;
  email?: string | null;
}


/** Clave estable de fila de importación (idempotencia). */
export function buildPedidoRowKey(input: {
  fila_venta: string;
  fecha_texto: string;
  id_unificado: string;
}): string {
  return (
    "ph_" +
    stableHash(
      `${input.id_unificado}|${input.fila_venta}|${normalizeText(input.fecha_texto)}`,
    )
  );
}

export function construirDryRun(args: {
  rows: RawPedidoRow[];
  clientes: ClienteRef[];
  catalogo: CatalogoProducto[];
  rowKeysExistentes: Set<string>;
  mapeoManual: Record<string, string>;
}): DryRunResultado {
  const { rows, clientes, catalogo, rowKeysExistentes, mapeoManual } = args;

  // Resolución de cliente: código principal -> alias histórico -> clave técnica
  // -> teléfono -> email. Nunca crea clientes: lo ambiguo va a mapeo manual.
  const porCodigo = new Map<string, ClienteRef>();
  const porAlias = new Map<string, ClienteRef>();
  const porClave = new Map<string, ClienteRef>();
  const porTelefono = new Map<string, ClienteRef>();
  const porEmail = new Map<string, ClienteRef>();
  clientes.forEach((c) => {
    const cod = normalizarIdUnificado(c.codigo_cliente_externo ?? "");
    if (cod && !porCodigo.has(cod)) porCodigo.set(cod, c);
    (c.codigos_alias ?? []).forEach((a) => {
      const k = normalizarIdUnificado(a);
      if (k && !porAlias.has(k)) porAlias.set(k, c);
    });
    if (c.external_import_key && !porClave.has(c.external_import_key)) {
      porClave.set(c.external_import_key, c);
    }
    if (c.telefono_normalizado && !porTelefono.has(c.telefono_normalizado)) {
      porTelefono.set(c.telefono_normalizado, c);
    }
    const mail = (c.email ?? "").trim().toLowerCase();
    if (mail && !porEmail.has(mail)) porEmail.set(mail, c);
  });

  const resolverCliente = (idUni: string): ClienteRef | null => {
    if (!idUni) return null;
    return (
      porCodigo.get(idUni) ??
      porAlias.get(idUni) ??
      porClave.get(idUni) ??
      porTelefono.get(idUni.replace(/[^0-9]/g, "").replace(/^0+/, "")) ??
      porEmail.get(idUni.toLowerCase()) ??
      null
    );
  };



  const pendientes: PendientePreview[] = [];
  const grupos = new Map<string, PedidoPreview>();
  const sinReconocer = new Set<string>();
  let filasIncluidas = 0;

  for (const r of rows) {
    const idUni = normalizarIdUnificado(r.id_unificado);

    if (!esIncluir(r.incluir)) {
      pendientes.push({
        fila: r.fila,
        fila_venta: r.fila_venta,
        fecha_texto: r.fecha,
        id_unificado: idUni,
        estado_coincide: r.estado_coincide,
        nombre_tienda: r.nombre_tienda || r.nombre,
        producto_texto: r.producto,
        cantidad: r.cantidad,
        total_texto: r.total_venta_bs,
        motivo:
          r.estado_coincide?.trim()
            ? `Marcada incluir=NO · ${r.estado_coincide.trim()}`
            : "Marcada incluir=NO",
      });
      continue;
    }

    filasIncluidas++;

    const cliente = idUni ? porCodigo.get(idUni) ?? null : null;
    const key = `${r.fila_venta}|${normalizeText(r.fecha)}|${idUni}`;
    const rowKey = buildPedidoRowKey({
      fila_venta: r.fila_venta,
      fecha_texto: r.fecha,
      id_unificado: idUni,
    });

    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = {
        key,
        row_key: rowKey,
        fila_venta: r.fila_venta,
        fecha: parseFecha(r.fecha),
        fecha_texto: r.fecha,
        id_unificado: idUni,
        cliente_id: cliente?.id ?? null,
        cliente_empresa: cliente?.empresa ?? null,
        lineas: [],
        total: 0,
        errores: [],
        ya_importado: rowKeysExistentes.has(rowKey),
      };
      if (!idUni) grupo.errores.push("Falta id_unificado");
      else if (!cliente) grupo.errores.push(`No existe un cliente con código ${idUni}`);
      if (!grupo.fecha) grupo.errores.push(`Fecha inválida: "${r.fecha || "vacía"}"`);
      grupos.set(key, grupo);
    }

    const erroresLinea: string[] = [];
    const cantidad = parseNumero(r.cantidad);
    const totalLinea = parseNumero(r.total_venta_bs);

    if (cantidad === null || cantidad <= 0) erroresLinea.push(`Cantidad inválida: "${r.cantidad}"`);
    if (totalLinea === null || totalLinea <= 0) erroresLinea.push(`Total inválido: "${r.total_venta_bs}"`);

    const textoProducto = (r.producto ?? "").trim();
    const manual = mapeoManual[textoProducto];
    const match = manual
      ? (() => {
          const p = catalogo.find((c) => c.id === manual);
          const { presentacion } = separarPresentacion(textoProducto);
          return {
            producto_id: p?.id ?? null,
            producto_nombre: p?.nombre ?? textoProducto,
            presentacion: ajustarPresentacionPublica(presentacion, p?.presentaciones ?? null),
            score: 1,
          } as MatchProducto;
        })()
      : matchProducto(textoProducto, catalogo);

    if (!textoProducto) erroresLinea.push("Falta el producto");
    else if (!match.producto_id) {
      erroresLinea.push(`Producto no reconocido: "${textoProducto}"`);
      sinReconocer.add(textoProducto);
    }

    const cant = Math.round(cantidad ?? 0);
    const precio = cant > 0 && totalLinea ? Number((totalLinea / cant).toFixed(2)) : 0;

    grupo.lineas.push({
      fila: r.fila,
      producto_texto: textoProducto,
      producto_id: match.producto_id,
      producto_nombre: match.producto_nombre,
      presentacion: match.presentacion,
      cantidad: cant,
      total_linea: totalLinea ?? 0,
      precio_unitario: precio,
      errores: erroresLinea,
    });
    grupo.total += totalLinea ?? 0;
  }

  const pedidos = Array.from(grupos.values()).map((g) => ({
    ...g,
    total: Number(g.total.toFixed(2)),
  }));

  return {
    pedidos,
    pendientes,
    productosSinReconocer: Array.from(sinReconocer).sort(),
    totalFilas: rows.length,
    filasIncluidas,
  };
}

// Reexport interno para poder usar el ajuste de presentación en el mapeo manual.
function ajustarPresentacionPublica(det: string | null, disponibles: string[] | null): string | null {
  return ajustarPresentacion(det, disponibles);
}

export function pedidoTieneErrores(p: PedidoPreview): boolean {
  return p.errores.length > 0 || p.lineas.some((l) => l.errores.length > 0);
}

export const PEDIDOS_TEMPLATE_CSV = [
  PEDIDOS_HEADERS.join(","),
  "1,15/03/2025,CLI-0001,Alta,Santa Cruz,Norte,Av. Cristo Redentor,Juan Perez,Lubricentro Perez,Juan,70011122,Antifreeze Green 5L,4,480,SI",
  "1,15/03/2025,CLI-0001,Alta,Santa Cruz,Norte,Av. Cristo Redentor,Juan Perez,Lubricentro Perez,Juan,70011122,Clear-X 1L,6,180,SI",
  "2,18/03/2025,,Sin coincidencia,Cochabamba,Sur,,Cliente sin match,,,,Supercoolant Red 20L,1,290,NO",
].join("\n");
