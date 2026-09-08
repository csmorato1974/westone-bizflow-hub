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
