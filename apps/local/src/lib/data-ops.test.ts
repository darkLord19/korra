import { PGlite } from "@electric-sql/pglite";
import { createBackup, MIGRATIONS } from "@korra/db/browser";
import { describe, expect, it } from "vitest";
import { DataOpError, PGLITE_IDB_NAME, prepareRestore, preflightDump } from "./data-ops";

const bytes = (s: string) => new TextEncoder().encode(s);

async function realBackupDump(): Promise<Blob> {
  const pg = new PGlite();
  await pg.exec("create table t (a int)");
  const dump = await pg.dumpDataDir("gzip");
  await pg.close();
  return dump;
}

/** A real backup of a (migrated, empty) database, built the way the app builds one. */
async function realBackup(): Promise<Blob> {
  const { migrateBundled } = await import("@korra/db/browser");
  const pg = new PGlite();
  await migrateBundled(pg as never, MIGRATIONS);
  const blobs = { exportAll: async () => [{ key: "u/o/d/a.pdf", mimeType: "application/pdf", bytes: bytes("%PDF") }] };
  const out = await createBackup({ pg, blobs });
  await pg.close();
  return out;
}

describe("restore preparation (everything checked before any data is touched)", () => {
  it("accepts a real backup", async () => {
    const file = Object.assign(await realBackup(), { name: "korra-backup-2026-10-06.korra" });
    const prepared = await prepareRestore(file);
    expect(prepared.filename).toBe("korra-backup-2026-10-06.korra");
    expect(prepared.restored.blobs).toHaveLength(1);
    expect(prepared.restored.manifest.schemaMigrations).toEqual(MIGRATIONS.map((m) => m.tag));
  }, 120_000);

  it("rejects text that is not a zip, with a clear message", async () => {
    await expect(prepareRestore(new Blob(["hello, not a backup"]))).rejects.toThrow(DataOpError);
    await expect(prepareRestore(new Blob(["hello, not a backup"]))).rejects.toThrow(/not a Korra backup/);
    await expect(prepareRestore(new Blob([]))).rejects.toThrow(/not a Korra backup/);
  });

  it("rejects a valid zip whose database dump is garbage, before anything could be deleted", async () => {
    // Same wrapper, a dump that is not a PGlite data dir: restoreBackup (the format check) accepts it, the preflight must not.
    const pg = { dumpDataDir: async () => new Blob([bytes("this is not a tarball")]) };
    const file = await createBackup({ pg, blobs: { exportAll: async () => [] } });
    await expect(prepareRestore(file)).rejects.toThrow(/damaged/);
  }, 120_000);

  it("rejects a dump that is valid gzip but not a tar archive, and a truncated one", async () => {
    const { gzipSync } = await import("node:zlib");
    const notTar = new Blob([gzipSync(bytes("just some text, not a tar archive")) as BlobPart]);
    await expect(prepareRestore(await createBackup({ pg: { dumpDataDir: async () => notTar }, blobs: { exportAll: async () => [] } }))).rejects.toThrow(/damaged/);

    const real = new Uint8Array(await (await realBackupDump()).arrayBuffer());
    const truncated = new Blob([real.subarray(0, Math.floor(real.length / 2)) as BlobPart]);
    await expect(prepareRestore(await createBackup({ pg: { dumpDataDir: async () => truncated }, blobs: { exportAll: async () => [] } }))).rejects.toThrow(/damaged/);
  }, 120_000);

  it("rejects a backup from a newer Korra", async () => {
    // A backup whose manifest says it was made by a newer format. Patch the manifest of a real backup.
    const real = await createBackup({ pg: { dumpDataDir: async () => new Blob([bytes("x")]) }, blobs: { exportAll: async () => [] } });
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await real.arrayBuffer());
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as Record<string, unknown>;
    zip.file("manifest.json", JSON.stringify({ ...manifest, version: 99 }));
    const file = new Blob([await zip.generateAsync({ type: "uint8array" }) as BlobPart]);
    await expect(prepareRestore(file)).rejects.toThrow(/newer version of Korra/);
  });

  it("preflightDump loads a real dump and fails a bad one", async () => {
    const real = new PGlite();
    const { migrateBundled } = await import("@korra/db/browser");
    await migrateBundled(real as never, MIGRATIONS);
    await expect(preflightDump(await real.dumpDataDir("gzip"))).resolves.toBeUndefined();
    await real.close();
    await expect(preflightDump(new Blob([bytes("nope")]))).rejects.toBeDefined();
  }, 120_000);

  it("derives the PGlite database name the way applyRestore does", () => {
    expect(PGLITE_IDB_NAME).toBe("/pglite/korra");
  });
});
