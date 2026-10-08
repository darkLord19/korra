import "fake-indexeddb/auto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { createIndexedDbBlobStore } from "./blob-idb";
import { migrateBundled, type MigrationClient } from "./browser-migrate";
import { applyRestore } from "./browser-restore";
import { MIGRATIONS } from "./migrations.generated";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("applyRestore", () => {
  it("replaces an existing idb:// store and the blob store with a backup", async () => {
    // "Old" local state: a database and a blob that the restore must replace.
    const old = new PGlite("idb://restore-test");
    await old.exec("create table t (v text); insert into t values ('old');");
    await old.close();
    const blobs = createIndexedDbBlobStore({ dbName: "restore-blobs" });
    await blobs.put("old", bytes("x"), "text/plain");

    // A backup taken elsewhere.
    const src = new PGlite();
    await src.exec("create table t (v text); insert into t values ('from-backup');");
    const srcBlobs = createIndexedDbBlobStore({ dbName: "restore-src" });
    await srcBlobs.put("u/o/d/new.pdf", bytes("%PDF"), "application/pdf");
    const restored = await restoreBackup(await createBackup({ pg: src, blobs: srcBlobs }));

    await applyRestore(restored, { blobs, dataDir: "idb://restore-test" });

    const after = new PGlite("idb://restore-test");
    expect((await after.query<{ v: string }>("select v from t")).rows.map((r) => r.v)).toEqual(["from-backup"]);
    await after.close();
    expect(await blobs.keys()).toEqual(["u/o/d/new.pdf"]);
  }, 120_000);

  it("restores a backup made at migration 0001 and migrates up to 0002", async () => {
    const v1 = new PGlite();
    await migrateBundled(v1 as unknown as MigrationClient, MIGRATIONS.slice(0, 2));
    const colsBefore = (
      await v1.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_bank' AND column_name = 'contact_email'",
      )
    ).rows;
    expect(colsBefore).toHaveLength(0);

    const v1Blobs = createIndexedDbBlobStore({ dbName: "v1-blobs" });
    const backup = await createBackup({ pg: v1, blobs: v1Blobs });
    await v1.close();

    const restored = await restoreBackup(backup);
    const targetBlobs = createIndexedDbBlobStore({ dbName: "v2-blobs" });
    await applyRestore(restored, { blobs: targetBlobs, dataDir: "idb://v2-test" });

    const booted = new PGlite("idb://v2-test");
    const colsAfter = (
      await booted.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'ad_bank' AND column_name IN ('contact_email', 'branch')",
      )
    ).rows;
    expect(colsAfter).toHaveLength(2);

    const profileCols = (
      await booted.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'exporter_profile' AND column_name IN ('signatory_name', 'signatory_designation', 'signature_blob_key', 'seal_blob_key')",
      )
    ).rows;
    expect(profileCols).toHaveLength(4);
    await booted.close();
  }, 120_000);
});
