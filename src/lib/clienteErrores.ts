type ErrorBaseDatos = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

const MENSAJE_TELEFONO_DUPLICADO =
  "Ese teléfono ya está registrado en otra ficha de cliente. Revisa el número o pide a un administrador que compruebe el duplicado.";

export function mensajeErrorGuardarCliente(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "No se pudo guardar la ficha del cliente. Inténtalo nuevamente.";
  }

  const dbError = error as ErrorBaseDatos;
  const textoError = [dbError.message, dbError.details, dbError.hint]
    .filter((valor): valor is string => typeof valor === "string")
    .join(" ")
    .toLowerCase();

  const esTelefonoDuplicado =
    textoError.includes("clientes_telefono_normalizado_uniq") ||
    (dbError.code === "23505" && textoError.includes("telefono_normalizado"));

  if (esTelefonoDuplicado) return MENSAJE_TELEFONO_DUPLICADO;

  return typeof dbError.message === "string" && dbError.message.trim()
    ? dbError.message
    : "No se pudo guardar la ficha del cliente. Inténtalo nuevamente.";
}
