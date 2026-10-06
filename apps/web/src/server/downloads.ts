import "server-only";
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
