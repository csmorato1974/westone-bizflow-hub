import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dashboardDesdeIso, dashboardRpcParams } from "@/lib/dashboardComercial";

describe("filtros del dashboard comercial", () => {
  const ahora = new Date("2026-09-08T12:00:00.000Z");

  it("convierte el periodo y todos los filtros a parametros de RPC", () => {
    expect(dashboardRpcParams({ periodo: "30d", ciudad: "todas", vendedorId: "todos" }, ahora)).toEqual({
      _desde: "2026-08-09T12:00:00.000Z",
      _hasta: "2026-09-08T12:00:00.000Z",
      _ciudad: null,
      _vendedor_id: null,
    });
  });

  it("conserva ciudad y vendedor seleccionados", () => {
    expect(dashboardRpcParams({ periodo: "todo", ciudad: "La Paz", vendedorId: "v-1" }, ahora)).toEqual({
      _desde: null,
      _hasta: "2026-09-08T12:00:00.000Z",
      _ciudad: "La Paz",
      _vendedor_id: "v-1",
    });
    expect(dashboardDesdeIso("todo", ahora)).toBeNull();
  });

  it("mantiene la RPC bajo RLS y fuerza el alcance del vendedor", () => {
    const sql = readFileSync(resolve("supabase/migrations/20260908155606_dashboard_comercial_rpc.sql"), "utf8");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("CASE WHEN v_es_admin THEN _vendedor_id ELSE v_uid END");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.dashboard_comercial");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.dashboard_comercial");
  });

  it("no marca como oportunidad una compra de hace 60 dias con filtro visible de 30 dias", () => {
    const sql = readFileSync(resolve("supabase/migrations/20260908155606_dashboard_comercial_rpc.sql"), "utf8");
    const cteHistorico = sql.match(/ultima_compra_historica AS MATERIALIZED \(([\s\S]*?)\n {2}\),\n {2}ciudades AS/)?.[1];

    expect(cteHistorico).toBeDefined();
    expect(cteHistorico).not.toContain("v_desde");
    expect(cteHistorico).toContain("p.created_at <= v_hasta");
    expect(cteHistorico).toContain("p.estado <> 'cancelado'");
    expect(cteHistorico).toContain("JOIN clientes_filtrados");
    expect(cteHistorico).toContain("p.vendedor_id = v_vendedor_id");
    expect(sql).toContain("LEFT JOIN ultima_compra_historica AS u");

    const hasta = new Date("2026-09-08T12:00:00.000Z");
    const desdeVisible = new Date("2026-08-09T12:00:00.000Z");
    const ultimaCompra = new Date("2026-07-10T12:00:00.000Z");
    const limiteInactividad = new Date(hasta.getTime() - 90 * 24 * 60 * 60 * 1000);

    expect(ultimaCompra < desdeVisible).toBe(true);
    expect(ultimaCompra < limiteInactividad).toBe(false);
  });
});
