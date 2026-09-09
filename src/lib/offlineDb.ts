export const OFFLINE_DB_NAME = "westone-offline";
export const OFFLINE_DB_VERSION = 1;

export type SyncMetadataKey = "clientes" | "catalogo";
export type SyncQueueStatus = "pending" | "syncing" | "error" | "synced";

export interface OfflineMetadata {
  id: string;
  user_id: string;
  key: SyncMetadataKey;
  synced_at: string;
  count: number;
}

export interface OfflineCacheRecord<T = unknown> {
  id: string;
  user_id: string;
  entity_id: string;
  value: T;
  cached_at: string;
}

export interface SyncQueueItem {
  id: string;
  user_id: string;
  entity: string;
  action: string;
  payload: unknown;
  status: SyncQueueStatus;
  attempts: number;
  created_at: string;
  updated_at: string;
  last_error?: string | null;
  remote_id?: string | null;
  depends_on?: string | null;
}

export interface OfflineStats {
  clientes: number;
  catalogo: number;
  pendientes: number;
  ultimaSincronizacion: string | null;
}

const STORE_METADATA = "metadata_sync";
const STORE_CLIENTES = "clientes_cache";
const STORE_CATALOGO = "catalogo_cache";
const STORE_QUEUE = "sync_queue";

const memory = {
  metadata: new Map<string, OfflineMetadata>(),
  clientes: new Map<string, OfflineCacheRecord>(),
  catalogo: new Map<string, OfflineCacheRecord>(),
  queue: new Map<string, SyncQueueItem>(),
};

const hasIndexedDb = () => typeof indexedDB !== "undefined";
const keyFor = (userId: string, entityId: string) => `${userId}:${entityId}`;
const metaKeyFor = (userId: string, key: SyncMetadataKey) => `${userId}:${key}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        const store = db.createObjectStore(STORE_METADATA, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CLIENTES)) {
        const store = db.createObjectStore(STORE_CLIENTES, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOGO)) {
        const store = db.createObjectStore(STORE_CATALOGO, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error de IndexedDB"));
  });
}

async function replaceUserRecords<T>(
  storeName: typeof STORE_CLIENTES | typeof STORE_CATALOGO,
  userId: string,
  values: T[],
  entityId: (value: T) => string,
) {
  const now = new Date().toISOString();
  if (!hasIndexedDb()) {
    const target = storeName === STORE_CLIENTES ? memory.clientes : memory.catalogo;
    for (const [key, row] of Array.from(target.entries())) if (row.user_id === userId) target.delete(key);
    for (const value of values) {
      const id = entityId(value);
      target.set(keyFor(userId, id), { id: keyFor(userId, id), user_id: userId, entity_id: id, value, cached_at: now });
    }
    return;
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const index = store.index("user_id");
    const cursorRequest = index.openCursor(IDBKeyRange.only(userId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        for (const value of values) {
          const id = entityId(value);
          store.put({ id: keyFor(userId, id), user_id: userId, entity_id: id, value, cached_at: now });
        }
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function getUserRecords<T>(storeName: typeof STORE_CLIENTES | typeof STORE_CATALOGO, userId: string): Promise<T[]> {
  if (!hasIndexedDb()) {
    const target = storeName === STORE_CLIENTES ? memory.clientes : memory.catalogo;
    return Array.from(target.values()).filter((row) => row.user_id === userId).map((row) => row.value as T);
  }
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const rows = await requestResult(tx.objectStore(storeName).index("user_id").getAll(IDBKeyRange.only(userId)));
  db.close();
  return (rows as OfflineCacheRecord<T>[]).map((row) => row.value);
}

export async function setOfflineMetadata(userId: string, key: SyncMetadataKey, count: number, syncedAt = new Date().toISOString()) {
  const record: OfflineMetadata = { id: metaKeyFor(userId, key), user_id: userId, key, synced_at: syncedAt, count };
  if (!hasIndexedDb()) {
    memory.metadata.set(record.id, record);
    return;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_METADATA, "readwrite");
  tx.objectStore(STORE_METADATA).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function getOfflineMetadata(userId: string, key: SyncMetadataKey): Promise<OfflineMetadata | null> {
  const id = metaKeyFor(userId, key);
  if (!hasIndexedDb()) return memory.metadata.get(id) ?? null;
  const db = await openDb();
  const tx = db.transaction(STORE_METADATA, "readonly");
  const result = await requestResult(tx.objectStore(STORE_METADATA).get(id));
  db.close();
  return (result as OfflineMetadata | undefined) ?? null;
}

export async function putClientesCache<T extends { id: string }>(userId: string, clientes: T[]) {
  await replaceUserRecords(STORE_CLIENTES, userId, clientes, (c) => c.id);
  await setOfflineMetadata(userId, "clientes", clientes.length);
}

export async function getClientesCache<T>(userId: string): Promise<T[]> {
  return getUserRecords<T>(STORE_CLIENTES, userId);
}

export async function putCatalogoCache<T extends { id: string }>(userId: string, productos: T[]) {
  await replaceUserRecords(STORE_CATALOGO, userId, productos, (p) => p.id);
  await setOfflineMetadata(userId, "catalogo", productos.length);
}

export async function getCatalogoCache<T>(userId: string): Promise<T[]> {
  return getUserRecords<T>(STORE_CATALOGO, userId);
}

export async function enqueueSync(item: Omit<SyncQueueItem, "id" | "status" | "attempts" | "created_at" | "updated_at"> & { id?: string }) {
  const now = new Date().toISOString();
  const record: SyncQueueItem = {
    ...item,
    id: item.id ?? crypto.randomUUID(),
    status: "pending",
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
  if (!hasIndexedDb()) {
    memory.queue.set(record.id, record);
    return record;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  tx.objectStore(STORE_QUEUE).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function countPendingSync(userId: string) {
  if (!hasIndexedDb()) return Array.from(memory.queue.values()).filter((item) => item.user_id === userId && item.status !== "synced").length;
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readonly");
  const rows = await requestResult(tx.objectStore(STORE_QUEUE).index("user_id").getAll(IDBKeyRange.only(userId)));
  db.close();
  return (rows as SyncQueueItem[]).filter((item) => item.status !== "synced").length;
}

export async function getOfflineStats(userId: string): Promise<OfflineStats> {
  const [clientes, catalogo, pendientes, clientesMeta, catalogoMeta] = await Promise.all([
    getClientesCache(userId).then((rows) => rows.length),
    getCatalogoCache(userId).then((rows) => rows.length),
    countPendingSync(userId),
    getOfflineMetadata(userId, "clientes"),
    getOfflineMetadata(userId, "catalogo"),
  ]);
  const dates = [clientesMeta?.synced_at, catalogoMeta?.synced_at].filter(Boolean) as string[];
  dates.sort();
  return { clientes, catalogo, pendientes, ultimaSincronizacion: dates.at(-1) ?? null };
}

export async function clearUserOfflineData(userId: string) {
  if (!userId) return;
  if (!hasIndexedDb()) {
    for (const target of [memory.metadata, memory.clientes, memory.catalogo, memory.queue]) {
      for (const [key, row] of Array.from(target.entries())) if ((row as { user_id?: string }).user_id === userId) target.delete(key);
    }
    return;
  }

  const db = await openDb();
  for (const storeName of [STORE_METADATA, STORE_CLIENTES, STORE_CATALOGO, STORE_QUEUE]) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const request = tx.objectStore(storeName).index("user_id").openCursor(IDBKeyRange.only(userId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
}

/** Solo para pruebas en entornos sin IndexedDB. */
export function resetOfflineMemoryForTests() {
  memory.metadata.clear();
  memory.clientes.clear();
  memory.catalogo.clear();
  memory.queue.clear();
}
