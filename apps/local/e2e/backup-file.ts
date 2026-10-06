import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import JSZip from "jszip";

export interface BackupContents {
  manifest: Record<string, unknown>;
  /** Every public table: its rows as JSON strings, sorted (row order is not part of the state). */
  tables: Record<string, string[]>;
  /** blob key -> sha256 of its bytes, plus the recorded mime types. */
  blobs: Record<string, string>;
  mimes: Record<string, string>;
}

const json = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));

/** Opens a `.korra` file in node: the PGlite dump is loaded into a scratch database and read table by table. */
export async function readBackup(path: string): Promise<BackupContents> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as Record<string, unknown>;
  const mimes = JSON.parse(await zip.file("blobs.json")!.async("string")) as Record<string, string>;
  const blobs: Record<string, string> = {};
  for (const key of Object.keys(mimes)) blobs[key] = createHash("sha256").update(await zip.file(`blobs/${key}`)!.async("uint8array")).digest("hex");

  const dump = new Blob([(await zip.file("db.tar.gz")!.async("uint8array")) as BlobPart]);
  const pg = new PGlite({ loadDataDir: dump });
  await pg.waitReady;
  try {
    const names = (await pg.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).rows.map((r) => r.table_name);
    const tables: Record<string, string[]> = {};
    for (const t of names) tables[t] = (await pg.query(`select * from "${t}"`)).rows.map(json).sort();
    return { manifest, tables, blobs, mimes };
  } finally {
    await pg.close();
  }
}

/** A real backup with one part replaced, to make files the app must refuse. */
export async function tamper(path: string, edit: (zip: JSZip) => Promise<void> | void): Promise<Buffer> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  await edit(zip);
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
