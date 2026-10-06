// Isomorphic: no Node APIs, no Supabase. `crypto` is the Web Crypto global (browser, Node 19+, workers).
import { NotFoundError } from "./errors";

export interface BlobStore {
  createUploadUrl(key: string, mimeType: string): Promise<{ url: string; token: string }>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(keys: string[]): Promise<void>;
}

/** Blob keys look like `u/{userId}/{documentId}/{filename}`. Filenames are sanitised. */
export function blobKeyFor(userId: string, documentId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "_") || "file";
  return `u/${userId}/${documentId}/${safe}`;
}

/* ------------------------------ memory ------------------------------ */

/**
 * In-memory BlobStore for tests. `completeUpload` stands in for the browser's PUT to the
 * signed upload URL; it is exposed to tests as `simulateBrowserPut` from `@korra/db/testing`.
 */
export interface MemoryBlobStore extends BlobStore {
  completeUpload(token: string, bytes: Uint8Array): void;
  /** Test inspection: stored keys and mime types. */
  keys(): string[];
  mimeTypeOf(key: string): string | undefined;
}

export function createMemoryBlobStore(): MemoryBlobStore {
  const blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const pending = new Map<string, { key: string; mimeType: string }>();

  return {
    async createUploadUrl(key, mimeType) {
      const token = crypto.randomUUID();
      pending.set(token, { key, mimeType });
      return { url: `memory://upload/${key}?token=${token}`, token };
    },
    async get(key) {
      const b = blobs.get(key);
      if (!b) throw new NotFoundError(`blob not found: ${key}`);
      return b.bytes;
    },
    async put(key, bytes, mimeType) {
      blobs.set(key, { bytes, mimeType });
    },
    async createDownloadUrl(key, ttlSeconds) {
      if (!blobs.has(key)) throw new NotFoundError(`blob not found: ${key}`);
      return `memory://download/${key}?ttl=${ttlSeconds}`;
    },
    async delete(keys) {
      for (const k of keys) blobs.delete(k);
    },
    completeUpload(token, bytes) {
      const p = pending.get(token);
      if (!p) throw new Error("unknown or already used upload token");
      pending.delete(token);
      blobs.set(p.key, { bytes, mimeType: p.mimeType });
    },
    keys: () => [...blobs.keys()],
    mimeTypeOf: (key) => blobs.get(key)?.mimeType,
  };
}
