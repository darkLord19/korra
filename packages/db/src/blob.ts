import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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

/* ----------------------------- Supabase ----------------------------- */

export function createSupabaseBlobStore(opts: {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}): BlobStore {
  const client = createClient(opts.url, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = () => client.storage.from(opts.bucket);

  return {
    async createUploadUrl(key) {
      // The browser PUTs to `url` (the signed URL already embeds the token); the token is returned
      // as well for clients that use `uploadToSignedUrl(key, token, file)`. `mimeType` is supplied
      // by the browser as the Content-Type of its PUT.
      const { data, error } = await bucket().createSignedUploadUrl(key);
      if (error || !data) throw new Error(`createUploadUrl failed: ${error?.message ?? "no data"}`);
      return { url: data.signedUrl, token: data.token };
    },
    async get(key) {
      const { data, error } = await bucket().download(key);
      if (error || !data) throw new NotFoundError(`blob not found: ${key}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async put(key, bytes, mimeType) {
      const { error } = await bucket().upload(key, bytes, { contentType: mimeType, upsert: true });
      if (error) throw new Error(`put failed: ${error.message}`);
    },
    async createDownloadUrl(key, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(key, ttlSeconds);
      if (error || !data) throw new Error(`createDownloadUrl failed: ${error?.message ?? "no data"}`);
      return data.signedUrl;
    },
    async delete(keys) {
      if (keys.length === 0) return;
      const { error } = await bucket().remove(keys);
      if (error) throw new Error(`delete failed: ${error.message}`);
    },
  };
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
      const token = randomUUID();
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
