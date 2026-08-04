export type EstadoKey =
  | "inactivo"
  | "vinculo_roto"
  | "incompleto"
  | "sin_cuenta"
  | "cambiar_password"
  | "email_provisional"
  | "sin_vendedor"
  | "sin_lista"
  | "vinculada";

export interface EstadoBadgeDef {
  key: EstadoKey;
  label: string;
  className: string;
}

/** Orden de prioridad: el primero que aplique es el badge principal. */
const PRIORIDAD: EstadoKey[] = [
  "inactivo",
  "vinculo_roto",
  "incompleto",
  "sin_cuenta",
  "cambiar_password",
  "email_provisional",
  "sin_vendedor",
  "sin_lista",
  "vinculada",
];

const DEFS: Record<EstadoKey, EstadoBadgeDef> = {
  inactivo: { key: "inactivo", label: "Inactivo", className: "border-destructive text-destructive" },
  vinculo_roto: { key: "vinculo_roto", label: "Vínculo roto", className: "border-destructive text-destructive" },
  incompleto: { key: "incompleto", label: "Incompleto", className: "border-warning text-warning" },
  sin_cuenta: { key: "sin_cuenta", label: "Sin cuenta", className: "border-muted-foreground text-muted-foreground" },
  cambiar_password: { key: "cambiar_password", label: "Debe cambiar contraseña", className: "border-warning text-warning" },
  email_provisional: { key: "email_provisional", label: "Email provisional", className: "border-info text-info" },
  sin_vendedor: { key: "sin_vendedor", label: "Sin vendedor asignado", className: "border-warning text-warning" },
  sin_lista: { key: "sin_lista", label: "Sin lista de precios", className: "border-muted-foreground text-muted-foreground" },
  vinculada: { key: "vinculada", label: "Cuenta vinculada", className: "border-success text-success" },
};


export const PROVISIONAL_DOMAIN = "@clientes-temp.local";

export interface ClienteEstadoInput {
  activo: boolean;
  celular: string | null;
  email: string | null;
  email_provisional?: boolean | null;
  user_id: string | null;
  vendedor_id: string | null;
  lista_precio_id: string | null;
  perfil?: { email?: string | null; email_provisional?: boolean | null; must_change_password?: boolean | null } | null;
}

export interface ClienteEstado {
  keys: EstadoKey[];
  badges: EstadoBadgeDef[];
  principal: EstadoBadgeDef | null;
  secundarios: EstadoBadgeDef[];
  vinculada: boolean;
  vinculoRoto: boolean;
  incompleto: boolean;
  emailProvisional: boolean;
  sinVendedor: boolean;
  requiereAtencion: boolean;
}

export function computeEstado(c: ClienteEstadoInput): ClienteEstado {
  const perfil = c.perfil ?? null;
  const vinculoRoto = !!c.user_id && !perfil;
  const vinculada = !!c.user_id && !!perfil;
  const sinCuenta = !c.user_id;

  const esPlaceholder = (e?: string | null) =>
    (e ?? "").trim().toLowerCase().endsWith(PROVISIONAL_DOMAIN);

  // El email de acceso (perfil) manda; si no hay cuenta vinculada se usa el email del CRM.
  // Los flags email_provisional se ignoran: pueden quedar desactualizados tras un cambio de email.
  const emailProvisional = perfil
    ? esPlaceholder(perfil.email) || (!perfil.email?.trim() && esPlaceholder(c.email))
    : esPlaceholder(c.email);

  const cambiarPassword = !!perfil?.must_change_password;
  const sinVendedor = !c.vendedor_id;
  // "Incompleto" = faltan datos de contacto del cliente. La lista de precios se informa aparte.
  const incompleto = !c.celular?.trim() || !c.email?.trim();
  const sinLista = !c.lista_precio_id;

  const keys: EstadoKey[] = [];
  if (!c.activo) keys.push("inactivo");
  if (vinculoRoto) keys.push("vinculo_roto");
  if (incompleto) keys.push("incompleto");
  if (sinCuenta) keys.push("sin_cuenta");
  if (cambiarPassword) keys.push("cambiar_password");
  if (emailProvisional) keys.push("email_provisional");
  if (sinVendedor) keys.push("sin_vendedor");
  if (sinLista) keys.push("sin_lista");
  if (vinculada) keys.push("vinculada");

  const ordered = PRIORIDAD.filter((k) => keys.includes(k));
  const badges = ordered.map((k) => DEFS[k]);

  const requiereAtencion =
    sinCuenta || vinculoRoto || sinVendedor || incompleto || emailProvisional || cambiarPassword || !c.activo;


  return {
    keys: ordered,
    badges,
    principal: badges[0] ?? null,
    secundarios: badges.slice(1),
    vinculada,
    vinculoRoto,
    incompleto,
    emailProvisional,
    sinVendedor,
    requiereAtencion,
  };
}

export type FiltroEstado =
  | "todos"
  | "vinculadas"
  | "provisionales"
  | "sin_vendedor"
  | "incompletas"
  | "atencion";

export function matchFiltro(e: ClienteEstado, f: FiltroEstado): boolean {
  switch (f) {
    case "vinculadas":
      return e.vinculada;
    case "provisionales":
      return e.emailProvisional;
    case "sin_vendedor":
      return e.sinVendedor;
    case "incompletas":
      return e.incompleto || e.vinculoRoto;
    case "atencion":
      return e.requiereAtencion;
    default:
      return true;
  }
}
