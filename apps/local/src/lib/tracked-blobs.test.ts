import { describe, expect, it, vi } from "vitest";
import { createMemoryBlobStore } from "@korra/db/testing";
import { trackBlobs } from "./tracked-blobs";

const bytes = (s: string) => new TextEncoder().encode(s);

function setup() {
  const inner = createMemoryBlobStore();
  const minted = vi.spyOn(inner, "createDownloadUrl");
  let n = 0;
  // The memory store hands out one deterministic URL per key: make them distinct per mint, like object URLs are.
  minted.mockImplementation(async (key) => {
    await inner.get(key); // like the real stores: NotFoundError for a missing blob
    return `blob:test/${key}#${++n}`;
  });
  const revoked: string[] = [];
  return { inner, minted, revoked, tracked: trackBlobs(inner, (u) => revoked.push(u)) };
}

describe("trackBlobs", () => {
  it("completeUpload stores through the inner store and reports the key the token was issued for", async () => {
    const { inner, tracked } = setup();
    const { token } = await tracked.createUploadUrl("u/o/doc1/a.csv", "text/csv");
    await expect(tracked.completeUpload(token, bytes("a,b"))).resolves.toBe("u/o/doc1/a.csv");
    expect(await inner.get("u/o/doc1/a.csv")).toEqual(bytes("a,b"));
    await expect(tracked.completeUpload(token, bytes("again"))).rejects.toThrow(/unknown or already used/);
    await expect(tracked.completeUpload("nope", bytes("x"))).rejects.toThrow(/unknown or already used/);
  });

  it("mints one URL per key and reuses it (pack files never change)", async () => {
    const { tracked, minted } = setup();
    await tracked.put("k1", bytes("one"), "text/plain");
    const a = await tracked.createDownloadUrl("k1", 600);
    const b = await tracked.createDownloadUrl("k1", 600);
    expect(b).toBe(a);
    expect(minted).toHaveBeenCalledTimes(1);
  });

  it("still throws for a key whose blob is gone, even when a URL is cached", async () => {
    const { tracked } = setup();
    await tracked.put("k1", bytes("one"), "text/plain");
    await tracked.createDownloadUrl("k1", 600);
    await tracked.delete(["k1"]);
    await expect(tracked.createDownloadUrl("k1", 600)).rejects.toThrow(/blob not found/);
  });

  it("releaseUrls revokes the upload existence check's URL and lets a later mint start fresh", async () => {
    const { tracked, revoked } = setup();
    await tracked.put("u/o/doc1/a.pdf", bytes("pdf"), "application/pdf");
    const url = await tracked.createDownloadUrl("u/o/doc1/a.pdf", 60);
    tracked.releaseUrls("u/o/doc1/a.pdf");
    expect(revoked).toEqual([url]);
    tracked.releaseUrls("u/o/doc1/a.pdf"); // idempotent
    expect(revoked).toEqual([url]);
    expect(await tracked.createDownloadUrl("u/o/doc1/a.pdf", 60)).not.toBe(url);
  });

  it("keepOnly revokes every URL outside the pack now on screen, so URLs stay bounded", async () => {
    const { tracked, revoked } = setup();
    for (const k of ["p1/a", "p1/b", "p2/a"]) await tracked.put(k, bytes(k), "text/plain");
    const [a1, b1] = [await tracked.createDownloadUrl("p1/a", 600), await tracked.createDownloadUrl("p1/b", 600)];
    tracked.keepOnly([a1, b1]);
    expect(revoked).toEqual([]);
    const a2 = await tracked.createDownloadUrl("p2/a", 600);
    tracked.keepOnly([a2]);
    expect(revoked.sort()).toEqual([a1, b1].sort());
    tracked.revokeAll();
    expect(revoked).toContain(a2);
    expect(revoked).toHaveLength(3);
  });

  it("readTextByUrl reads the text behind a URL it minted without a request, and is null for strangers", async () => {
    const { tracked } = setup();
    await tracked.put("p/guide.md", bytes("# How to submit"), "text/markdown");
    const url = await tracked.createDownloadUrl("p/guide.md", 600);
    await expect(tracked.readTextByUrl(url)).resolves.toBe("# How to submit");
    await expect(tracked.readTextByUrl("blob:elsewhere/1")).resolves.toBeNull();
    tracked.releaseUrls("p/guide.md");
    await expect(tracked.readTextByUrl(url)).resolves.toBeNull();
  });
});
