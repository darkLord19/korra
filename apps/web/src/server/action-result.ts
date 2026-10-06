import "server-only";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@korra/backend";
import { parseFieldErrors } from "@korra/ui";
import type { ActionError, ActionResult } from "@/lib/action-result";

export function toActionError(e: unknown): ActionError {
  if (e instanceof ValidationError) {
    const fieldErrors = parseFieldErrors(e.message);
    return { kind: "validation", message: e.message, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) };
  }
  if (e instanceof NotFoundError) return { kind: "not_found", message: e.message };
  if (e instanceof UnauthenticatedError) return { kind: "unauthenticated", message: "Sign in to continue." };
  if (e instanceof ForbiddenError) return { kind: "forbidden", message: "You have read-only access to this account." };
  // Next's redirect() / notFound() are thrown; they must reach the framework.
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
  console.error("[korra] unexpected error in a server action", e);
  return { kind: "unknown", message: "Something went wrong. Try again." };
}

/** Runs one use-case and reports the outcome as data. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}
