import "fake-indexeddb/auto";
import { PGlite } from "@electric-sql/pglite";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup, BACKUP_VERSION } from "./backup";
import { createIndexedDbBlobStore } from "./blob-idb";
import { MIGRATIONS } from "./migrations.generated";

const bytes = (s: string) => new TextEncoder().encode(s);

async function source() {
  const pg = new PGlite();
  await pg.exec("create table t (id int primary key, v text); insert into t values (1, 'hello');");
  const blobs = createIndexedDbBlobStore({ dbName: `bk-${Math.random()}` });
  await blobs.put("u/o/d1/inv.pdf", bytes("%PDF-1.4"), "application/pdf");
  await blobs.put("u/o/d2/pay.csv", bytes("a,b"), "text/csv");
  return { pg, blobs };
}

async function tamper(file: Blob, edit: (zip: JSZip) => void | Promise<void>): Promise<Blob> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  await edit(zip);
  return new Blob([(await zip.generateAsync({ type: "uint8array" })) as BlobPart]);
}

describe(".korra backup", () => {
  it("has the documented zip layout", async () => {
    const { pg, blobs } = await source();
    const file = await createBackup({ pg, blobs, now: () => new Date("2026-10-06T10:00:00Z") });
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    expect(Object.keys(zip.files).filter((n) => !n.endsWith("/")).sort()).toEqual(
      ["blobs.json", "blobs/u/o/d1/inv.pdf", "blobs/u/o/d2/pay.csv", "db.tar.gz", "manifest.json"].sort(),
    );
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest).toEqual({
      format: "korra-backup",
      version: 1,
      schemaMigrations: MIGRATIONS.map((m) => m.tag),
      createdAt: "2026-10-06T10:00:00.000Z",
      blobCount: 2,
    });
    expect(JSON.parse(await zip.file("blobs.json")!.async("string"))).toEqual({
      "u/o/d1/inv.pdf": "application/pdf",
      "u/o/d2/pay.csv": "text/csv",
    });
    const gz = await zip.file("db.tar.gz")!.async("uint8array");
    expect([gz[0], gz[1]]).toEqual([0x1f, 0x8b]); // gzip magic
  }, 60_000);

  it("restores: data dir loads into PGlite and blobs come back byte for byte", async () => {
    const { pg, blobs } = await source();
    const restored = await restoreBackup(await createBackup({ pg, blobs }));
    expect(restored.manifest.version).toBe(BACKUP_VERSION);
    expect(restored.blobs.map((b) => b.key).sort()).toEqual(["u/o/d1/inv.pdf", "u/o/d2/pay.csv"]);
    expect(restored.blobs.find((b) => b.key === "u/o/d2/pay.csv")).toMatchObject({ mimeType: "text/csv", bytes: bytes("a,b") });
    const copy = new PGlite("memory://", { loadDataDir: restored.dataDir });
    expect((await copy.query<{ v: string }>("select v from t where id = 1")).rows[0]!.v).toBe("hello");
    await copy.close();
  }, 60_000);

  it("rejects anything that is not a restorable backup", async () => {
    const { pg, blobs } = await source();
    const good = await createBackup({ pg, blobs });
    const reject = (f: Blob | Uint8Array, re: RegExp) => expect(restoreBackup(f)).rejects.toThrow(re);

    await reject(bytes("not a zip"), /not a valid zip/);
    await reject(await tamper(good, (z) => void z.remove("manifest.json")), /no manifest/);
    await reject(await tamper(good, (z) => void z.file("manifest.json", JSON.stringify({ format: "other", version: 1 }))), /Unknown backup format/);
    const m = JSON.parse(await (await JSZip.loadAsync(await good.arrayBuffer())).file("manifest.json")!.async("string"));
    await reject(await tamper(good, (z) => void z.file("manifest.json", JSON.stringify({ ...m, version: BACKUP_VERSION + 1 }))), /newer version of Korra/);
    await reject(await tamper(good, (z) => void z.file("manifest.json", JSON.stringify({ ...m, schemaMigrations: [...m.schemaMigrations, "9999_future"] }))), /newer database schema/);
    await reject(await tamper(good, (z) => void z.remove("db.tar.gz")), /no database dump/);
    await reject(await tamper(good, (z) => void z.remove("blobs/u/o/d1/inv.pdf")), /missing a stored file/);
    await expect(restoreBackup(good)).resolves.toBeTruthy();
  }, 60_000);

  it("accepts a backup made with fewer (older) migrations", async () => {
    const { pg, blobs } = await source();
    const good = await createBackup({ pg, blobs });
    const m = JSON.parse(await (await JSZip.loadAsync(await good.arrayBuffer())).file("manifest.json")!.async("string"));
    const older = await tamper(good, (z) => void z.file("manifest.json", JSON.stringify({ ...m, schemaMigrations: m.schemaMigrations.slice(0, 1) })));
    await expect(restoreBackup(older)).resolves.toBeTruthy();
  }, 60_000);
});
