import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUserOfflineData,
  countPendingSync,
  enqueueSync,
  getCatalogoCache,
  getClientesCache,
  getOfflineMetadata,
  getOfflineStats,
  putCatalogoCache,
  putClientesCache,
  resetOfflineMemoryForTests,
} from "@/lib/offlineDb";

describe("offlineDb", () => {
  beforeEach(() => resetOfflineMemoryForTests());

  it("guarda y recupera clientes por usuario", async () => {
    await putClientesCache("u1", [{ id: "c1", empresa: "Uno" }, { id: "c2", empresa: "Dos" }]);
    expect(await getClientesCache<{ id: string; empresa: string }>("u1")).toHaveLength(2);
    expect(await getClientesCache("u2")).toEqual([]);
  });

  it("mantiene aislamiento entre usuarios", async () => {
    await putClientesCache("u1", [{ id: "c1", empresa: "Uno" }]);
    await putClientesCache("u2", [{ id: "c1", empresa: "Otro" }]);
    expect((await getClientesCache<{ empresa: string }>("u1"))[0].empresa).toBe("Uno");
    expect((await getClientesCache<{ empresa: string }>("u2"))[0].empresa).toBe("Otro");
  });

  it("guarda catálogo y metadatos de sincronización", async () => {
    await putCatalogoCache("u1", [{ id: "p1", nombre: "Producto" }]);
    expect(await getCatalogoCache("u1")).toHaveLength(1);
    const meta = await getOfflineMetadata("u1", "catalogo");
    expect(meta?.count).toBe(1);
    expect(meta?.synced_at).toBeTruthy();
  });

  it("reporta estado vacío cuando no existe caché", async () => {
    expect(await getOfflineStats("u1")).toEqual({
      clientes: 0,
      catalogo: 0,
      pendientes: 0,
      ultimaSincronizacion: null,
    });
  });

  it("deja preparada la cola de sincronización y cuenta pendientes", async () => {
    await enqueueSync({ user_id: "u1", entity: "cliente", action: "create", payload: { empresa: "X" } });
    await enqueueSync({ user_id: "u2", entity: "cliente", action: "create", payload: { empresa: "Y" } });
    expect(await countPendingSync("u1")).toBe(1);
    expect(await countPendingSync("u2")).toBe(1);
  });

  it("limpia solamente los datos del usuario que cierra sesión", async () => {
    await putClientesCache("u1", [{ id: "c1" }]);
    await putClientesCache("u2", [{ id: "c2" }]);
    await putCatalogoCache("u1", [{ id: "p1" }]);
    await clearUserOfflineData("u1");
    expect(await getClientesCache("u1")).toEqual([]);
    expect(await getCatalogoCache("u1")).toEqual([]);
    expect(await getClientesCache("u2")).toHaveLength(1);
  });
});
