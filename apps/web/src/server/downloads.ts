import "server-only";
import type { PackDownloadsWire } from "@korra/backend/schemas";
import type { PackDownloads } from "@korra/ui";
import { getDeps, isDevInMemory } from "./deps";

const MEMORY = "memory://download/";

/** Browser-usable URL for a signed download URL. Dev in-memory blobs are served by /api/dev-upload. */
export function browserUrl(url: string): string {
  if (isDevInMemory() && url.startsWith(MEMORY)) return `/api/dev-upload?key=${encodeURIComponent(url.slice(MEMORY.length).split("?")[0]!)}`;
  return url;
}

/** Server-side read of a small text file behind a signed URL. Returns null on any failure. */
export async function fetchText(url: string): Promise<string | null> {
  try {
    if (isDevInMemory() && url.startsWith(MEMORY)) {
      const bytes = await (await getDeps()).blobs.get(url.slice(MEMORY.length).split("?")[0]!);
      return new TextDecoder().decode(bytes);
    }
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** A pack's downloads ready for the browser: usable file URLs and the guide's text (read here, not by the browser). */
export async function packForBrowser(d: PackDownloadsWire): Promise<PackDownloads> {
  const guide = d.files.find((f) => f.name.startsWith("HOW-TO-SUBMIT"));
  const guideText = guide ? await fetchText(guide.url) : null;
  return { ...d, files: d.files.map((f) => ({ ...f, url: browserUrl(f.url) })), guideText };
}
