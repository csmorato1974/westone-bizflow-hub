export type DashboardPeriodo = "30d" | "90d" | "12m" | "todo";

export interface DashboardFiltrosValue {
  periodo: DashboardPeriodo;
  ciudad: string;
  vendedorId: string;
}

export interface DashboardVendedorOption {
  id: string;
  nombre: string;
}

export interface DashboardComercialData {
  kpis: {
    ventas: number;
    pedidos: number;
    ticket_promedio: number;
    clientes_activos: number;
  };
  serie: { mes: string; total: number; pedidos: number }[];
  ranking: { vendedor_id: string; nombre: string; total: number; pedidos: number }[];
  top_clientes: { cliente_id: string; empresa: string; ciudad: string; total: number; pedidos: number }[];
  top_productos: { producto_id: string; nombre: string; sku: string | null; cantidad: number; monto: number }[];
  ventas_ciudad: { ciudad: string; total: number; pedidos: number }[];
  mapa: DashboardMapaCliente[];
  oportunidades: { id: string; empresa: string; ciudad: string; ultima_compra: string | null }[];
  filtros: {
    ciudades: string[];
    vendedores: DashboardVendedorOption[];
  };
}

export interface DashboardMapaCliente {
  id: string;
  empresa: string;
  ciudad: string;
  latitud: number;
  longitud: number;
  ventas: number;
  pedidos: number;
}

export const DASHBOARD_PERIODOS: { value: DashboardPeriodo; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "12m", label: "12 meses" },
  { value: "todo", label: "Todo" },
];

export const dashboardDesdeIso = (periodo: DashboardPeriodo, ahora = new Date()): string | null => {
  if (periodo === "todo") return null;

  const desde = new Date(ahora);
  if (periodo === "30d") desde.setDate(desde.getDate() - 30);
  if (periodo === "90d") desde.setDate(desde.getDate() - 90);
  if (periodo === "12m") desde.setMonth(desde.getMonth() - 12);
  return desde.toISOString();
};

export const DASHBOARD_FILTROS_INICIALES: DashboardFiltrosValue = {
  periodo: "30d",
  ciudad: "todas",
  vendedorId: "todos",
};

export const dashboardRpcParams = (filtros: DashboardFiltrosValue, ahora = new Date()) => ({
  _desde: dashboardDesdeIso(filtros.periodo, ahora),
  _hasta: ahora.toISOString(),
  _ciudad: filtros.ciudad === "todas" ? null : filtros.ciudad,
  _vendedor_id: filtros.vendedorId === "todos" ? null : filtros.vendedorId,
});
