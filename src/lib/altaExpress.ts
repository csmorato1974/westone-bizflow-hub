export type CampoAltaExpress = "empresa" | "contacto" | "celular" | "email" | "direccion" | "notas" | "listaPrecio";

export type DatosAltaExpress = Partial<Record<CampoAltaExpress, string>>;

const etiquetas: Array<{ campo: CampoAltaExpress; patron: string }> = [
  { campo: "empresa", patron: "empresa|negocio|raz[oó]n social" },
  { campo: "contacto", patron: "contacto|nombre(?: del contacto)?" },
  { campo: "celular", patron: "celular|tel[eé]fono|whatsapp" },
  { campo: "email", patron: "e[- ]?mail|correo(?: electr[oó]nico)?" },
  { campo: "direccion", patron: "direcci[oó]n|ubicaci[oó]n" },
  { campo: "listaPrecio", patron: "lista(?: de)? precios?" },
  { campo: "notas", patron: "notas?|observaciones?" },
];

const etiquetaRegex = new RegExp(
  `(?:^|[.\\n,;]\\s*|\\s+)(${etiquetas.map(({ patron }) => `(?:${patron})`).join("|")})\\b\\s*(?::|es)?\\s*`,
  "gi",
);

const campoPorEtiqueta = (etiqueta: string): CampoAltaExpress | undefined => {
  const normalizada = etiqueta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return etiquetas.find(({ patron }) => new RegExp(`^(?:${patron})$`, "i").test(normalizada))?.campo;
};

const limpiarValor = (valor: string) => valor.replace(/^[\s,:;.-]+|[\s,:;.-]+$/g, "").replace(/\s+/g, " ").trim();

export function normalizarCelularDictado(valor: string): string {
  const tieneMas = valor.trim().startsWith("+");
  const digitos = valor.replace(/\D/g, "");
  return digitos ? `${tieneMas ? "+" : ""}${digitos}` : "";
}

export function normalizarEmailDictado(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/\bguion\s+bajo\b/gi, "_")
    .replace(/\bguion\b/gi, "-")
    .replace(/\barroba\b/gi, "@")
    .replace(/\bpunto\b/gi, ".")
    .replace(/\s+/g, "")
    .replace(/^[,;:.-]+|[,;:.-]+$/g, "");
}

/** Extrae campos cuando el vendedor dicta frases etiquetadas, por ejemplo:
 * "Empresa Repuestos Norte. Contacto Ana Pérez. Celular 591 700 00000."
 */
export function extraerDatosAltaExpress(transcripcion: string): DatosAltaExpress {
  const resultado: DatosAltaExpress = {};
  const coincidencias = Array.from(transcripcion.matchAll(etiquetaRegex));

  coincidencias.forEach((coincidencia, indice) => {
    const campo = campoPorEtiqueta(coincidencia[1]);
    if (!campo) return;

    const inicio = (coincidencia.index ?? 0) + coincidencia[0].length;
    const fin = indice + 1 < coincidencias.length ? coincidencias[indice + 1].index ?? transcripcion.length : transcripcion.length;
    const valor = limpiarValor(transcripcion.slice(inicio, fin));
    if (!valor) return;

    if (campo === "celular") resultado[campo] = normalizarCelularDictado(valor);
    else if (campo === "email") resultado[campo] = normalizarEmailDictado(valor);
    else resultado[campo] = valor;
  });

  return resultado;
}

export const camposDetectados = (datos: DatosAltaExpress): CampoAltaExpress[] =>
  (Object.keys(datos) as CampoAltaExpress[]).filter((campo) => Boolean(datos[campo]));
