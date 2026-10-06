import { describe, expect, it, vi } from "vitest";
import { NotFoundError, blobKeyFor, createMemoryBlobStore, createSupabaseBlobStore } from "./index";
import { simulateBrowserPut } from "./testing";

describe("memory BlobStore", () => {
  it("round-trips upload via simulated browser PUT, put/get, download url and delete", async () => {
    const store = createMemoryBlobStore();
    const key = blobKeyFor("u1", "d1", "my file.pdf");
    expect(key).toBe("u/u1/d1/my_file.pdf");

    const up = await store.createUploadUrl(key, "application/pdf");
    expect(up.url.startsWith("memory://")).toBe(true);
    await expect(store.get(key)).rejects.toBeInstanceOf(NotFoundError);
    simulateBrowserPut(store, up, new Uint8Array([1, 2, 3]));
    expect([...(await store.get(key))]).toEqual([1, 2, 3]);
    expect(store.mimeTypeOf(key)).toBe("application/pdf");
    expect(() => simulateBrowserPut(store, up, new Uint8Array())).toThrow(); // token is single use

    await store.put("k2", new Uint8Array([9]), "text/plain");
    expect(await store.createDownloadUrl("k2", 60)).toContain("memory://download/k2");
    await store.delete([key, "k2", "never-existed"]);
    expect(store.keys()).toEqual([]);
    await expect(store.createDownloadUrl("k2", 60)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("supabase BlobStore (mocked fetch; no network, no env needed)", () => {
  it("issues a signed upload url and removes objects through the storage API", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/object/upload/sign/")) {
        return new Response(JSON.stringify({ url: "/object/upload/sign/documents/a/b?token=tok123" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const store = createSupabaseBlobStore({ url: "https://proj.supabase.co", serviceRoleKey: "svc", bucket: "documents" });
      const up = await store.createUploadUrl("a/b", "application/pdf");
      expect(up.token).toBe("tok123");
      expect(up.url).toContain("token=tok123");
      await store.delete([]); // no call
      await store.delete(["a/b"]);
      expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/object/documents"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
