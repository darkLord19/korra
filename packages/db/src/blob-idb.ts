// Browser-only BlobStore on IndexedDB (client-only v0). Raw IndexedDB (no dependency). Isomorphic in the
// sense that it imports no Node/server code; it simply needs a global `indexedDB` (fake-indexeddb in tests).
import type { BlobStore } from "./blob-core";
import { NotFoundError } from "./errors";

export interface StoredBlob {
  key: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface IndexedDbBlobStore extends BlobStore {
  /** Store a file straight away (no upload URL round trip). Equivalent to `put`. */
  putDirect(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  /**
   * Stands in for the PUT to the "upload URL": the app calls this with the File's bytes after
   * `requestUpload`, passing the `token` from its result. Tokens are single use and live in memory for this tab.
   */
  completeUpload(token: string, bytes: Uint8Array): Promise<void>;
  /** Every stored blob (for backups). */
  exportAll(): Promise<StoredBlob[]>;
  /** Replaces the whole store with `blobs` (for restores). */
  replaceAll(blobs: StoredBlob[]): Promise<void>;
  keys(): Promise<string[]>;
  /** Revokes the `blob:` URLs handed out by `createDownloadUrl` and closes the connection. */
  close(): void;
}

const STORE = "blobs";
type Row = { mimeType: string; bytes: Uint8Array };

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function createIndexedDbBlobStore(opts: { dbName: string }): IndexedDbBlobStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(opts.dbName, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error("Could not open the blob database"));
    }));
  const store = async (mode: IDBTransactionMode) => {
    const tx = (await open()).transaction(STORE, mode);
    return { tx, os: tx.objectStore(STORE) };
  };

  const pending = new Map<string, { key: string; mimeType: string }>();
  const urls = new Set<string>();
  const copy = (b: Uint8Array) => new Uint8Array(b); // detach from the caller's buffer

  const put = async (key: string, bytes: Uint8Array, mimeType: string) => {
    const { tx, os } = await store("readwrite");
    os.put({ mimeType, bytes: copy(bytes) } satisfies Row, key);
    await done(tx);
  };

  return {
    async createUploadUrl(key, mimeType) {
      const token = crypto.randomUUID();
      pending.set(token, { key, mimeType });
      return { url: `local://${key}`, token };
    },
    async completeUpload(token, bytes) {
      const p = pending.get(token);
      if (!p) throw new Error("unknown or already used upload token");
      pending.delete(token);
      await put(p.key, bytes, p.mimeType);
    },
    put,
    putDirect: put,
    async get(key) {
      const { os } = await store("readonly");
      const row = (await req(os.get(key))) as Row | undefined;
      if (!row) throw new NotFoundError(`blob not found: ${key}`);
      return new Uint8Array(row.bytes);
    },
    async createDownloadUrl(key) {
      const { os } = await store("readonly");
      const row = (await req(os.get(key))) as Row | undefined;
      if (!row) throw new NotFoundError(`blob not found: ${key}`);
      const url = URL.createObjectURL(new Blob([new Uint8Array(row.bytes)], { type: row.mimeType }));
      urls.add(url);
      return url;
    },
    async delete(keys) {
      if (keys.length === 0) return;
      const { tx, os } = await store("readwrite");
      for (const k of keys) os.delete(k);
      await done(tx);
    },
    async keys() {
      const { os } = await store("readonly");
      return (await req(os.getAllKeys())) as string[];
    },
    async exportAll() {
      const { os } = await store("readonly");
      const [keys, rows] = await Promise.all([req(os.getAllKeys()) as Promise<string[]>, req(os.getAll()) as Promise<Row[]>]);
      return keys.map((key, i) => ({ key, mimeType: rows[i]!.mimeType, bytes: new Uint8Array(rows[i]!.bytes) }));
    },
    async replaceAll(blobs) {
      const { tx, os } = await store("readwrite");
      os.clear();
      for (const b of blobs) os.put({ mimeType: b.mimeType, bytes: copy(b.bytes) } satisfies Row, b.key);
      await done(tx);
    },
    close() {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
      void dbPromise?.then((d) => d.close());
      dbPromise = null;
    },
  };
}
