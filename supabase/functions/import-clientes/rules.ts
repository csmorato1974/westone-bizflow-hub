/**
 * Copia de las reglas de normalización/matching de `src/lib/importClientes.ts`.
 * Ambas implementaciones DEBEN comportarse igual. `RULES_VERSION` se valida en
 * cada petición: si el frontend envía otra versión, el lote se rechaza.
 */

export const RULES_VERSION = "1.1.0";
export const PROVISIONAL_EMAIL_DOMAIN = "clientes-temp.local";

export type RowEstado =
  | "nuevo"
  | "duplicado_exacto"
  | "actualizable"
  | "coincidencia_probable"
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

export function stableHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

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

export function buildProvisionalEmail(nombreNormalizado: string, telefono: string): string {
  const partes = nombreNormalizado.split(" ").filter(Boolean).slice(0, 2);
  if (partes.length >= 2) return `${partes[0]}.${partes[1]}@${PROVISIONAL_EMAIL_DOMAIN}`;
  const base = partes[0] ?? "cliente";
  const tel = telefono || stableHash(base);
  return `${base}-${tel}@${PROVISIONAL_EMAIL_DOMAIN}`;
}

/**
 * Contraseña provisional CRIPTOGRÁFICAMENTE ALEATORIA.
 * Nunca se deriva del teléfono ni de ningún dato personal: debe ser impredecible.
 * Solo se genera en el servidor (edge function) y se entrega una única vez al super admin.
 */
export function buildProvisionalPassword(_telefono?: string, _key?: string): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const simbolos = "!@#$%*?-_";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alfabeto[bytes[i] % alfabeto.length];
  const extra = new Uint8Array(2);
  crypto.getRandomValues(extra);
  // Garantiza complejidad: mayúscula, minúscula, dígito y símbolo.
  return `W${out}${extra[0] % 10}${simbolos[extra[1] % simbolos.length]}`;
}


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
  // Referencia principal: nombre de la tienda / negocio (empresa).
  const nombre = (raw.empresa || raw.nombre_completo || "").trim();
  const nombre_normalizado = normalizeText(nombre);
  const telefono_normalizado = normalizePhone(raw.telefono);
  let email = normalizeEmail(raw.email);
  let email_provisional = false;

  if (email && !isValidEmail(email)) {
    errores.push(`Email inválido: ${email}`);
    email = "";
  }
  if (!nombre && !telefono_normalizado) errores.push("Fila sin nombre y sin teléfono");

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

/* ------------------------- Matching -------------------------------- */

export interface ExistingCliente {
  id: string;
  user_id: string | null;
  empresa: string | null;
  contacto: string | null;
  celular: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  vendedor_id: string | null;
  lista_precio_id: string | null;
  telefono_normalizado: string | null;
  external_import_key: string | null;
}

export interface MatchResult {
  estado: RowEstado;
  cliente_id: string | null;
  motivo: string;
  cambios: string[];
}

function cambiosPropuestos(row: NormalizedRow, c: ExistingCliente): string[] {
  const cambios: string[] = [];
  if (row.empresa && normalizeText(row.empresa) !== normalizeText(c.empresa)) cambios.push("empresa");
  const contactoPersona = (row.original.nombre_completo ?? "").trim();
  if (contactoPersona && normalizeText(contactoPersona) !== normalizeText(c.contacto))
    cambios.push("contacto");
  if (row.telefono_normalizado && row.telefono_normalizado !== normalizePhone(c.celular))
    cambios.push("celular");
  if (!row.email_provisional && row.email && row.email !== normalizeEmail(c.email))
    cambios.push("email");
  if (row.direccion && row.direccion_normalizada !== normalizeText(c.direccion))
    cambios.push("direccion");
  if (row.ciudad && normalizeText(row.ciudad) !== normalizeText(c.ciudad)) cambios.push("ciudad");
  return cambios;
}

/** Jerarquía de detección de duplicados (idéntica en dry_run y commit). */
export function matchRow(row: NormalizedRow, existentes: ExistingCliente[]): MatchResult {
  if (row.errores.length > 0) {
    return { estado: "error", cliente_id: null, motivo: row.errores.join(" · "), cambios: [] };
  }

  const decide = (c: ExistingCliente, motivo: string): MatchResult => {
    const cambios = cambiosPropuestos(row, c);
    return {
      estado: cambios.length > 0 ? "actualizable" : "duplicado_exacto",
      cliente_id: c.id,
      motivo,
      cambios,
    };
  };

  // 1. Clave de importación conocida (reimportación)
  const porKey = existentes.find(
    (c) => c.external_import_key && c.external_import_key === row.external_import_key,
  );
  if (porKey) return decide(porKey, "Reimportación: misma clave de trazabilidad");

  // 2. Teléfono normalizado exacto
  if (row.telefono_normalizado.length >= 7) {
    const porTel = existentes.find(
      (c) => normalizePhone(c.telefono_normalizado ?? c.celular) === row.telefono_normalizado,
    );
    if (porTel) return decide(porTel, "Mismo teléfono");
  }

  // 3/4. Email exacto (real o provisional)
  if (row.email) {
    const porEmail = existentes.find((c) => normalizeEmail(c.email) === row.email);
    if (porEmail)
      return decide(
        porEmail,
        isProvisionalEmail(row.email) ? "Mismo email provisional" : "Mismo email",
      );
  }

  // 5. Nombre normalizado + últimos dígitos del teléfono
  if (row.nombre_normalizado && row.telefono_normalizado.length >= 6) {
    const cola = row.telefono_normalizado.slice(-6);
    const parcial = existentes.find(
      (c) =>
        (normalizeText(c.contacto) === row.nombre_normalizado ||
          normalizeText(c.empresa) === row.nombre_normalizado) &&
        normalizePhone(c.celular).endsWith(cola),
    );
    if (parcial) return decide(parcial, "Mismo nombre y teléfono parcial");
  }

  // 6. Nombre similar + dirección similar
  if (row.nombre_normalizado) {
    for (const c of existentes) {
      const simNombre = Math.max(
        similarity(row.nombre_normalizado, normalizeText(c.contacto)),
        similarity(row.nombre_normalizado, normalizeText(c.empresa)),
      );
      if (simNombre < 0.85) continue;
      const simDir = similarity(row.direccion_normalizada, normalizeText(c.direccion));
      if (simDir >= 0.7 || !row.direccion_normalizada) {
        return {
          estado: "coincidencia_probable",
          cliente_id: c.id,
          motivo: `Nombre similar (${Math.round(simNombre * 100)}%)`,
          cambios: cambiosPropuestos(row, c),
        };
      }
    }
  }

  return { estado: "nuevo", cliente_id: null, motivo: "Sin coincidencias", cambios: [] };
}
