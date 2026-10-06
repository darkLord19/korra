import "fake-indexeddb/auto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { createIndexedDbBlobStore } from "./blob-idb";
import { applyRestore } from "./browser-restore";

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
});
