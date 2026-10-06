// `.korra` backup: a zip of the PGlite data dir dump, every blob and a manifest. Browser-safe (jszip + Blob).
import JSZip from "jszip";
import type { StoredBlob } from "./blob-idb";
import { MIGRATIONS } from "./migrations.generated";

export const BACKUP_FORMAT = "korra-backup";
export const BACKUP_VERSION = 1;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Tags of the bundled migrations the dump was taken with. */
  schemaMigrations: string[];
  createdAt: string;
  blobCount: number;
}

export interface BackupSource {
  /** PGlite or PGliteWorker. */
  pg: { dumpDataDir(compression?: "none" | "gzip" | "auto"): Promise<Blob> };
  blobs: { exportAll(): Promise<StoredBlob[]> };
  now?: () => Date;
}

export class BackupError extends Error {
  override name = "BackupError";
}

const asBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** Builds the `.korra` file (a zip). Suggested filename: `korra-backup-YYYY-MM-DD.korra`. */
export async function createBackup(src: BackupSource): Promise<Blob> {
  const dump = await src.pg.dumpDataDir("gzip");
  const blobs = await src.blobs.exportAll();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaMigrations: MIGRATIONS.map((m) => m.tag),
    createdAt: (src.now?.() ?? new Date()).toISOString(),
    blobCount: blobs.length,
  };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("db.tar.gz", await asBytes(dump), { compression: "STORE" }); // already gzip
  const mimes: Record<string, string> = {};
  for (const b of blobs) {
    zip.file(`blobs/${b.key}`, b.bytes);
    mimes[b.key] = b.mimeType;
  }
  zip.file("blobs.json", JSON.stringify(mimes));
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Blob([out as BlobPart], { type: "application/zip" });
}

export interface RestoredBackup {
  manifest: BackupManifest;
  /** Pass to `new PGlite(dir, { loadDataDir })`. */
  dataDir: Blob;
  blobs: StoredBlob[];
}

/** Reads and validates a `.korra` file. Throws BackupError for anything that is not a backup this build can restore. */
export async function restoreBackup(file: Blob | Uint8Array | ArrayBuffer): Promise<RestoredBackup> {
  const data = file instanceof Blob ? await asBytes(file) : file;
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (e) {
    throw new BackupError("This file is not a Korra backup (it is not a valid zip).", { cause: e });
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new BackupError("This file is not a Korra backup (no manifest).");
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await manifestFile.async("string"));
  } catch (e) {
    throw new BackupError("The backup manifest is unreadable.", { cause: e });
  }
  if (manifest?.format !== BACKUP_FORMAT) throw new BackupError(`Unknown backup format: ${String(manifest?.format)}.`);
  if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new BackupError("The backup has an invalid version.");
  if (manifest.version > BACKUP_VERSION) {
    throw new BackupError(`This backup was made by a newer version of Korra (backup version ${manifest.version}). Update Korra and try again.`);
  }
  if (!Array.isArray(manifest.schemaMigrations)) throw new BackupError("The backup manifest is incomplete.");
  const known = new Set(MIGRATIONS.map((m) => m.tag));
  const unknown = manifest.schemaMigrations.filter((t) => !known.has(t));
  if (unknown.length) {
    throw new BackupError(`This backup uses a newer database schema (${unknown.join(", ")}). Update Korra and try again.`);
  }
  const dump = zip.file("db.tar.gz");
  if (!dump) throw new BackupError("The backup has no database dump.");
  const mimes = (await zip.file("blobs.json")?.async("string").then((s) => JSON.parse(s) as Record<string, string>)) ?? {};
  const blobs: StoredBlob[] = [];
  for (const [key, mimeType] of Object.entries(mimes)) {
    const f = zip.file(`blobs/${key}`);
    if (!f) throw new BackupError(`The backup is missing a stored file: ${key}.`);
    blobs.push({ key, mimeType, bytes: await f.async("uint8array") });
  }
  return { manifest, dataDir: new Blob([await dump.async("uint8array") as BlobPart], { type: "application/x-gzip" }), blobs };
}
