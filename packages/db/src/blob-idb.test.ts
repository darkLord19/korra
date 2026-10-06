import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createIndexedDbBlobStore } from "./blob-idb";
import { blobKeyFor } from "./blob-core";
import { NotFoundError } from "./errors";

const bytes = (s: string) => new TextEncoder().encode(s);
let n = 0;
const fresh = () => createIndexedDbBlobStore({ dbName: `blobs-${n++}` });

describe("IndexedDB BlobStore", () => {
  it("round-trips the upload flow: createUploadUrl -> completeUpload -> get", async () => {
    const store = fresh();
    const key = blobKeyFor("local-owner", "d1", "my invoice.pdf");
    const up = await store.createUploadUrl(key, "application/pdf");
    expect(up.url).toBe(`local://${key}`);
    await store.completeUpload(up.token, bytes("%PDF-1.4 x"));
    expect(new TextDecoder().decode(await store.get(key))).toBe("%PDF-1.4 x");
    await expect(store.completeUpload(up.token, bytes("again"))).rejects.toThrow(/token/);
  });

  it("putDirect/put store bytes, keys() lists them, get of a missing key is NotFound", async () => {
    const store = fresh();
    await store.putDirect("a/b", bytes("one"), "text/plain");
    await store.put("a/c", bytes("two"), "text/csv");
    expect((await store.keys()).sort()).toEqual(["a/b", "a/c"]);
    await expect(store.get("nope")).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.createDownloadUrl("nope", 60)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not alias the caller's buffer", async () => {
    const store = fresh();
    const b = bytes("abc");
    await store.put("k", b, "text/plain");
    b[0] = 0;
    expect(new TextDecoder().decode(await store.get("k"))).toBe("abc");
  });

  it("createDownloadUrl returns a blob: URL with the stored mime type", async () => {
    const store = fresh();
    await store.put("k", bytes("hello"), "application/pdf");
    const url = await store.createDownloadUrl("k", 60);
    expect(url.startsWith("blob:")).toBe(true);
    const blob = await (await import("node:buffer")).resolveObjectURL(url);
    expect(blob?.type).toBe("application/pdf");
    expect(await blob?.text()).toBe("hello");
    store.close();
  });

  it("delete removes keys; exportAll/replaceAll round-trip", async () => {
    const store = fresh();
    await store.put("a", bytes("1"), "text/plain");
    await store.put("b", bytes("2"), "image/png");
    await store.delete(["a"]);
    expect(await store.keys()).toEqual(["b"]);
    const all = await store.exportAll();
    expect(all).toEqual([{ key: "b", mimeType: "image/png", bytes: bytes("2") }]);
    await store.replaceAll([{ key: "z", mimeType: "text/csv", bytes: bytes("zz") }]);
    expect(await store.keys()).toEqual(["z"]);
  });

  it("persists across store instances on the same database name", async () => {
    const a = createIndexedDbBlobStore({ dbName: "shared" });
    await a.put("k", bytes("v"), "text/plain");
    a.close();
    const b = createIndexedDbBlobStore({ dbName: "shared" });
    expect(new TextDecoder().decode(await b.get("k"))).toBe("v");
  });
});
