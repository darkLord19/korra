/**
 * Pure runtime values shared by every `KorraApi` adapter and the screens (client-safe: no db, ingest, packs or
 * server-only imports, so it can sit behind `@korra/backend/schemas`). The error classifier that needs the db
 * error classes lives in `./errors` (`toWireError`).
 */

export type ApiErrorKind = "validation" | "not_found" | "forbidden" | "unauthenticated" | "unknown";

/** A use-case failure as it crosses the app boundary (server action result or the local adapter). */
export interface ApiErrorWire {
  kind: ApiErrorKind;
  message: string;
  /** Field name -> message; present only for `validation` errors that name fields. */
  fieldErrors?: Record<string, string>;
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";
export const UNAUTHENTICATED_MESSAGE = "Sign in to continue.";
export const READ_ONLY_MESSAGE = "You have read-only access to this account.";

/** Use-case validation messages look like "field: message; field: message". */
export function parseFieldErrors(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of message.split("; ")) {
    const i = part.indexOf(": ");
    if (i > 0 && /^[\w.]+$/.test(part.slice(0, i))) out[part.slice(0, i).split(".")[0]!] = part.slice(i + 2);
  }
  return out;
}

/** The submission guide among a pack's files (`HOW-TO-SUBMIT-<bank>.md`). */
export const isGuideFile = (file: { name: string }): boolean => file.name.startsWith("HOW-TO-SUBMIT");
