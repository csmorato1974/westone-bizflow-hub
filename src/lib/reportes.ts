/** Utilidades compartidas por los módulos de reporte (solo lectura). */

/** Normaliza texto: minúsculas y sin acentos, para búsquedas tolerantes. */
export const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const bs = (n: number | null | undefined) =>
  `${(Number(n) || 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

export const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const mesLabel = (mes: string) => {
  const [y, m] = mes.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
};

export interface MesPunto {
  mes: string;
  total: number;
  pedidos: number;
}

/** Completa los meses faltantes hacia atrás para que el gráfico sea continuo. */
export function serieUltimosMeses(datos: MesPunto[], meses = 12): MesPunto[] {
  const mapa = new Map(datos.map((d) => [d.mes, d]));
  const out: MesPunto[] = [];
  const hoy = new Date();
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push(mapa.get(key) ?? { mes: key, total: 0, pedidos: 0 });
  }
  return out;
}

export interface ClienteEstadisticas {
  total_gastado: number;
  pedidos: number;
  primera_compra: string | null;
  ultima_compra: string | null;
  ticket_promedio: number;
  producto_top: { nombre: string; cantidad: number } | null;
  por_mes: MesPunto[];
}

export interface ReporteVentas {
  ventas_total: number;
  pedidos_total: number;
  ticket_promedio: number;
  top_clientes: { cliente_id: string; empresa: string; ciudad: string | null; total: number; pedidos: number }[];
  top_productos: { producto_id: string; nombre: string; sku: string | null; cantidad: number; monto: number }[];
  por_mes: MesPunto[];
  clientes_por_ciudad: { ciudad: string; clientes: number }[];
  clientes_estado: {
    total: number;
    activos: number;
    inactivos: number;
    provisionales: number;
    incompletos: number;
    sin_cuenta: number;
  };
}
