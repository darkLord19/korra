import "server-only";
import { UNKNOWN_ERROR, toWireError } from "@korra/backend";
import type { ActionError, ActionResult } from "@/lib/action-result";

/** The classification is shared with the in-browser adapter (`toWireError`); only the Next.js specifics are here. */
export function toActionError(e: unknown): ActionError {
  const known = toWireError(e);
  if (known) return known;
  // Next's redirect() / notFound() are thrown; they must reach the framework.
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
  console.error("[korra] unexpected error in a server action", e);
  return UNKNOWN_ERROR;
}

/** Runs one use-case and reports the outcome as data. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}
