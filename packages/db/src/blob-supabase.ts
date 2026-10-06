import { createClient } from "@supabase/supabase-js";
import { NotFoundError } from "./errors";
import type { BlobStore } from "./blob-core";

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

