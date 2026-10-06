import type { BlobStore } from "@korra/db";

/** What the app needs from the underlying store: the IndexedDB one (`createIndexedDbBlobStore`) or, in tests, the memory one. */
export type UploadableBlobStore = BlobStore & { completeUpload(token: string, bytes: Uint8Array): void | Promise<void> };

/**
 * A `BlobStore` decorator that owns the lifetime of the `blob:` URLs the store hands out. The IndexedDB store
 * mints a fresh object URL on every `createDownloadUrl` and revokes them only when it is closed, but a blob URL
 * pins its whole file in memory, and the use-cases call `createDownloadUrl` for two different reasons:
 *   - `confirmUpload` uses it as an existence check (a throwaway URL for a file of up to 20 MB), and
 *   - `getPackDownloads` mints the links the person clicks.
 * So: one URL per key (pack files never change), the upload check's URL is released straight away, and only the
 * pack currently on screen keeps live URLs.
 */
export interface TrackedBlobs extends BlobStore {
  /** Stands in for the browser's PUT to the upload URL. Resolves with the blob key the token was issued for. */
  completeUpload(token: string, bytes: Uint8Array): Promise<string>;
  /** Revokes the URLs minted for `key` (used right after `confirmUpload`'s existence check). */
  releaseUrls(key: string): void;
  /** Revokes every URL except `urls` (the downloads of the pack now on screen). */
  keepOnly(urls: Iterable<string>): void;
  /** Reads the text behind a URL this store minted, without a network request (`connect-src 'self'` does not allow blob:). Null when unknown or unreadable. */
  readTextByUrl(url: string): Promise<string | null>;
  /** Revokes everything (page hide). */
  revokeAll(): void;
}

export function trackBlobs(inner: UploadableBlobStore, revoke: (url: string) => void = (u) => URL.revokeObjectURL(u)): TrackedBlobs {
  const tokenKeys = new Map<string, string>();
  const urlByKey = new Map<string, string>();
  const keyByUrl = new Map<string, string>();

  const drop = (key: string) => {
    const url = urlByKey.get(key);
    if (url === undefined) return;
    urlByKey.delete(key);
    keyByUrl.delete(url);
    revoke(url);
  };

  return {
    async createUploadUrl(key, mimeType) {
      const r = await inner.createUploadUrl(key, mimeType);
      tokenKeys.set(r.token, key);
      return r;
    },
    async completeUpload(token, bytes) {
      const key = tokenKeys.get(token);
      if (key === undefined) throw new Error("unknown or already used upload token");
      await inner.completeUpload(token, bytes);
      tokenKeys.delete(token);
      return key;
    },
    get: (key) => inner.get(key),
    put: (key, bytes, mimeType) => inner.put(key, bytes, mimeType),
    async delete(keys) {
      for (const k of keys) drop(k);
      await inner.delete(keys);
    },
    async createDownloadUrl(key, ttlSeconds) {
      const known = urlByKey.get(key);
      if (known !== undefined) {
        await inner.get(key); // still has to throw NotFoundError for a deleted blob
        return known;
      }
      const url = await inner.createDownloadUrl(key, ttlSeconds);
      urlByKey.set(key, url);
      keyByUrl.set(url, key);
      return url;
    },
    releaseUrls: drop,
    keepOnly(urls) {
      const keep = new Set(urls);
      for (const [key, url] of [...urlByKey]) if (!keep.has(url)) drop(key);
    },
    async readTextByUrl(url) {
      const key = keyByUrl.get(url);
      if (key === undefined) return null;
      try {
        return new TextDecoder().decode(await inner.get(key));
      } catch {
        return null;
      }
    },
    revokeAll() {
      for (const key of [...urlByKey.keys()]) drop(key);
    },
  };
}
