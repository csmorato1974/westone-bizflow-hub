import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { coberturaGps, esPinVerificado, normalizarIntensidad, puntosValidos, boundsDeClientes } from "@/lib/mapaComercial";
import { parseRows, normalizeRow, TEMPLATE_HEADERS, TEMPLATE_CSV } from "@/lib/importClientes";
import type { DashboardMapaGeo, DashboardMapaHeatmapPunto } from "@/lib/dashboardComercial";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null, ZoomControl: () => null, Marker: () => null, CircleMarker: () => null, Popup: () => null,
  useMap: () => ({ fitBounds: () => undefined, invalidateSize: () => undefined }),
}));

const migracionGeo = () => {
  const dir = resolve("supabase/migrations");
  const f = readdirSync(dir).find((n) => n.includes("dashboard_mapa_geo_zonas"))!;
  return readFileSync(resolve(dir, f), "utf8");
};

describe("pines solo con GPS verificado", () => {
  it("un cliente sin gps_verificado nunca es pin", () => {
    expect(esPinVerificado({ latitud: -16.5, longitud: -68.1, gps_verificado: false })).toBe(false);
    expect(esPinVerificado({ latitud: -16.5, longitud: -68.1, gps_verificado: null })).toBe(false);
    expect(esPinVerificado({ latitud: 0, longitud: 0, gps_verificado: true })).toBe(false);
    expect(esPinVerificado({ latitud: -16.5, longitud: -68.1, gps_verificado: true })).toBe(true);
  });

  it("la RPC filtra pines por gps_verificado y 'mapa' es alias de mapa_geo.pines", () => {
    const sql = migracionGeo();
    expect(sql).toContain("c.gps_verificado IS TRUE");
    expect(sql).toContain("WHERE g.tiene_gps");
    expect(sql).toContain("'mapa',mapa_geo_pines.value");
    expect(sql).not.toContain("mapa_legacy");
    expect(sql).not.toMatch(/USING \(true\)/i);
  });
});

describe("heatmap agregado por zona/ciudad", () => {
  const puntos: DashboardMapaHeatmapPunto[] = [
    { clave: "la paz|sopocachi", origen: "zona", nombre: "Sopocachi", ciudad: "La Paz", zona: "Sopocachi", latitud: -16.51, longitud: -68.12, ventas: 500, pedidos: 3, cantidad_clientes: 4, clientes_con_gps: 1, clientes_pendientes_gps: 3 },
    { clave: "tarija|", origen: "ciudad", nombre: "Tarija", ciudad: "Tarija", zona: null, latitud: -21.5355, longitud: -64.7296, ventas: 0, pedidos: 0, cantidad_clientes: 2, clientes_con_gps: 0, clientes_pendientes_gps: 2 },
  ];
  it("acepta puntos agregados y calcula bounds e intensidad", () => {
    expect(puntosValidos(puntos)).toHaveLength(2);
    expect(boundsDeClientes(puntos)).not.toBeNull();
    const f = normalizarIntensidad(puntos.map((p) => p.ventas));
    expect(f(500)).toBe(1);
    expect(f(0)).toBe(0);
  });
});

describe("cobertura GPS", () => {
  it("listas mixtas y vacías", () => {
    expect(coberturaGps(6, 54)).toBe(11.1);
    expect(coberturaGps(3, 3)).toBe(100);
    expect(coberturaGps(0, 0)).toBe(0);
  });
});

describe("MapaComercial", () => {
  const vacio: DashboardMapaGeo = {
    metricas: { total_clientes: 5, con_gps: 0, pendientes_gps: 5, sin_referencia_geo: 2, representados_heatmap: 3, cobertura_gps_pct: 0 },
    pines: [], heatmap: [],
  };
  it("muestra cobertura y mensaje vacío del heatmap", async () => {
    const { MapaComercial } = await import("@/components/dashboard/MapaComercial");
    render(<MapaComercial mapaGeo={vacio} />);
    expect(screen.getByText("0 con GPS · 5 pendientes GPS")).toBeInTheDocument();
    expect(screen.getByText("2 sin referencia geográfica")).toBeInTheDocument();
    expect(screen.getByText("No hay referencias geográficas disponibles para este filtro.")).toBeInTheDocument();
    screen.getByRole("button", { name: /Pines/ }).click();
    expect(await screen.findByText("No hay clientes con GPS verificado para este filtro.")).toBeInTheDocument();
  });
});

describe("importación: columna ZONA", () => {
  it("ZONA y BARRIO se conservan en zona y no en notas", () => {
    expect(TEMPLATE_HEADERS.indexOf("zona")).toBe(TEMPLATE_HEADERS.indexOf("ciudad") + 1);
    expect(TEMPLATE_CSV.split("\n")[0]).toContain("ciudad,zona");
    const { rows } = parseRows("NOMBRE,TELEFONO,CIUDAD,ZONA,NOTAS\nAna,70000001,La Paz,Sopocachi,vip");
    expect(rows[0].zona).toBe("Sopocachi");
    expect(rows[0].notas).toBe("vip");
    const b = parseRows("nombre,telefono,barrio\nLuis,70000002, Miraflores ").rows[0];
    expect(b.zona).toBe("Miraflores");
    expect(b.notas).toBe("");
    expect(normalizeRow(b).zona).toBe("Miraflores");
  });
});