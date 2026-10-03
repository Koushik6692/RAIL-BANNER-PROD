const DB_NAME = "rail-banner-local-media";
const STORE = "files";
const DB_VERSION = 1;

type StoredMedia = {
  key: string;
  name: string;
  type: string;
  buffer: ArrayBuffer;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

/** Persist uploaded media so export works after refresh without re-fetching blob: URLs. */
export async function idbPutMedia(keys: string[], file: Blob, name: string) {
  const buffer = await file.arrayBuffer();
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const savedAt = Date.now();
    for (const key of keys) {
      if (!key) continue;
      const row: StoredMedia = {
        key,
        name,
        type: file.type || "application/octet-stream",
        buffer,
        savedAt,
      };
      store.put(row);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

export async function idbGetMedia(key: string): Promise<File | undefined> {
  if (!key) return undefined;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE).get(key) as IDBRequest<StoredMedia>);
    if (!row?.buffer) return undefined;
    return new File([row.buffer], row.name || "media.bin", {
      type: row.type || "application/octet-stream",
    });
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}
