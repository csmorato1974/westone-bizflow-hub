/**
 * Reglas de normalización y matching para la importación masiva de clientes.
 *
 * IMPORTANTE: este archivo y `supabase/functions/import-clientes/rules.ts`
 * DEBEN mantener exactamente las mismas reglas (normalización, generación de
 * email provisional, clave de importación y jerarquía de coincidencias).
 * Cualquier cambio aquí debe replicarse allí. La versión de reglas
 * (`RULES_VERSION`) se envía en cada petición y la edge function rechaza el
 * lote si no coincide con la suya.
 */

export const RULES_VERSION = "1.1.0";

export const PROVISIONAL_EMAIL_DOMAIN = "clientes-temp.local";

export const TEMPLATE_HEADERS = [
  "nombre_completo",
  "empresa",
  "telefono",
  "email",
  "direccion",
  "ciudad",
  "vendedor_asignado",
  "lista_precio",
  "codigo_cliente_externo",
  "notas",
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

export type RowEstado =
  | "nuevo"
  | "duplicado_exacto"
  | "actualizable"
  | "coincidencia_probable"
  | "error";

export type RowAccion =
  | "crear"
  | "actualizar"
  | "vincular"
  | "ignorar"
  | "revisar"
  | "error";

export interface RawRow {
  fila: number;
  nombre_completo: string;
  empresa: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  vendedor_asignado: string;
  lista_precio: string;
  codigo_cliente_externo: string;
  notas: string;
}

export interface NormalizedRow {
  fila: number;
  original: RawRow;
  nombre: string;
  nombre_normalizado: string;
  empresa: string;
  telefono_normalizado: string;
  email: string;
  email_provisional: boolean;
  direccion: string;
  direccion_normalizada: string;
  ciudad: string;
  vendedor_asignado: string;
  lista_precio: string;
  codigo_cliente_externo: string;
  notas: string;
  external_import_key: string;
  clave_origen: "telefono" | "email" | "nombre_direccion" | "ninguna";
  errores: string[];
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isProvisionalEmail(value: string | null | undefined): boolean {
  return normalizeEmail(value).endsWith("@" + PROVISIONAL_EMAIL_DOMAIN);
}

/** Hash estable (FNV-1a 32 bits) en hexadecimal. */
export function stableHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Clave técnica de trazabilidad.
 *
 * Estrategia (punto explícito del plan): NUNCA depende de
 * `codigo_cliente_externo`, porque puede venir vacío o cambiar entre
 * exportaciones. El código externo se guarda como metadato aparte.
 *
 * Prioridad de identidad estable:
 *   1. teléfono normalizado  -> "tel:<digitos>"
 *   2. email real (no provisional) -> "mail:<email>"
 *   3. nombre normalizado + dirección normalizada -> "nom:<...>"
 *   4. si no hay ninguno de los tres, no se genera clave (fila inválida)
 */
export function buildImportKey(input: {
  telefono_normalizado: string;
  email: string;
  nombre_normalizado: string;
  direccion_normalizada: string;
}): { key: string; origen: NormalizedRow["clave_origen"] } {
  if (input.telefono_normalizado.length >= 7) {
    return { key: "tel_" + stableHash("tel:" + input.telefono_normalizado), origen: "telefono" };
  }
  if (input.email && !isProvisionalEmail(input.email)) {
    return { key: "mail_" + stableHash("mail:" + input.email), origen: "email" };
  }
  if (input.nombre_normalizado) {
    return {
      key:
        "nom_" +
        stableHash("nom:" + input.nombre_normalizado + "|" + input.direccion_normalizada),
      origen: "nombre_direccion",
    };
  }
  return { key: "", origen: "ninguna" };
}

/** Email provisional base, sin resolver colisiones. */
export function buildProvisionalEmail(nombreNormalizado: string, telefono: string): string {
  const partes = nombreNormalizado.split(" ").filter(Boolean).slice(0, 2);
  if (partes.length >= 2) {
    return `${partes[0]}.${partes[1]}@${PROVISIONAL_EMAIL_DOMAIN}`;
  }
  const base = partes[0] ?? "cliente";
  const tel = telefono || stableHash(base);
  return `${base}-${tel}@${PROVISIONAL_EMAIL_DOMAIN}`;
}

// NOTA DE SEGURIDAD: la generación de contraseñas provisionales vive exclusivamente
// en el servidor (supabase/functions/import-clientes/rules.ts) y es aleatoria.
// No debe existir ninguna versión de ese algoritmo en el bundle del cliente.


/** Similitud 0..1 basada en distancia de Levenshtein normalizada. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return 1 - prev[n] / Math.max(m, n);
}

export function normalizeRow(raw: RawRow): NormalizedRow {
  const errores: string[] = [];
  // Referencia principal: nombre de la tienda / negocio (empresa) y, en su
  // defecto, el nombre del contacto.
  const nombre = (raw.empresa || raw.nombre_completo || "").trim();
  const nombre_normalizado = normalizeText(nombre);
  const telefono_normalizado = normalizePhone(raw.telefono);
  let email = normalizeEmail(raw.email);
  let email_provisional = false;

  if (email && !isValidEmail(email)) {
    errores.push(`Email inválido: ${email}`);
    email = "";
  }

  if (!nombre && !telefono_normalizado) {
    errores.push("Fila sin nombre y sin teléfono");
  }

  const direccion = (raw.direccion ?? "").trim();
  const direccion_normalizada = normalizeText(direccion);

  if (!email) {
    email = buildProvisionalEmail(nombre_normalizado, telefono_normalizado);
    email_provisional = true;
  }

  const { key, origen } = buildImportKey({
    telefono_normalizado,
    email: email_provisional ? "" : email,
    nombre_normalizado,
    direccion_normalizada,
  });

  if (!key) errores.push("No hay datos suficientes para generar clave de trazabilidad");

  return {
    fila: raw.fila,
    original: raw,
    nombre,
    nombre_normalizado,
    empresa: (raw.empresa || nombre).trim(),
    telefono_normalizado,
    email,
    email_provisional,
    direccion,
    direccion_normalizada,
    ciudad: (raw.ciudad ?? "").trim(),
    vendedor_asignado: (raw.vendedor_asignado ?? "").trim(),
    lista_precio: (raw.lista_precio ?? "").trim(),
    codigo_cliente_externo: (raw.codigo_cliente_externo ?? "").trim(),
    notas: (raw.notas ?? "").trim(),
    external_import_key: key,
    clave_origen: origen,
    errores,
  };
}

/* ------------------------------------------------------------------ */
/* Parseo CSV / TSV                                                    */
/* ------------------------------------------------------------------ */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs >= semis && tabs >= commas && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<string, TemplateHeader> = {
  nombre: "nombre_completo",
  nombre_completo: "nombre_completo",
  contacto: "nombre_completo",
  cliente: "nombre_completo",
  empresa: "empresa",
  razon_social: "empresa",
  telefono: "telefono",
  celular: "telefono",
  movil: "telefono",
  whatsapp: "telefono",
  email: "email",
  correo: "email",
  mail: "email",
  direccion: "direccion",
  domicilio: "direccion",
  ciudad: "ciudad",
  localidad: "ciudad",
  vendedor: "vendedor_asignado",
  vendedor_asignado: "vendedor_asignado",
  lista: "lista_precio",
  lista_precio: "lista_precio",
  lista_de_precios: "lista_precio",
  codigo: "codigo_cliente_externo",
  codigo_cliente: "codigo_cliente_externo",
  codigo_cliente_externo: "codigo_cliente_externo",
  notas: "notas",
  observaciones: "notas",
};

export function parseRows(text: string): { rows: RawRow[]; headerFound: boolean } {
  const table = parseDelimited(text);
  if (table.length === 0) return { rows: [], headerFound: false };

  const headerCells = table[0].map((c) => normalizeText(c).replace(/\s+/g, "_"));
  const mapped = headerCells.map((h) => HEADER_ALIASES[h]);
  const headerFound = mapped.filter(Boolean).length >= 2;
  const dataRows = headerFound ? table.slice(1) : table;

  const rows: RawRow[] = dataRows.map((cells, idx) => {
    const row: RawRow = {
      fila: idx + 1,
      nombre_completo: "",
      empresa: "",
      telefono: "",
      email: "",
      direccion: "",
      ciudad: "",
      vendedor_asignado: "",
      lista_precio: "",
      codigo_cliente_externo: "",
      notas: "",
    };
    cells.forEach((cell, i) => {
      const key = headerFound ? mapped[i] : TEMPLATE_HEADERS[i];
      if (key) row[key] = (cell ?? "").trim();
    });
    return row;
  });

  return { rows, headerFound };
}

export const TEMPLATE_CSV = [
  TEMPLATE_HEADERS.join(","),
  "Juan Pérez,Talleres Pérez,+54 9 11 5555-1234,juan@talleres.com,Av. Siempreviva 742,Rosario,Ana Vendedora,Lista Mayorista,CLI-001,Cliente histórico",
  "María Gómez,,1155559876,,Calle Falsa 123,Córdoba,,,,Sin email: se genera provisional",
].join("\n");
