import { ForbiddenError, NotFoundError, ValidationError } from "@korra/db";
import {
  GENERIC_ERROR_MESSAGE,
  READ_ONLY_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
  parseFieldErrors,
  type ApiErrorWire,
} from "./wire-values";

export { ForbiddenError, NotFoundError, ValidationError };

/** No (valid) session. Web should redirect to sign-in. */
export class UnauthenticatedError extends Error {
  override name = "UnauthenticatedError";
  constructor(message = "Not signed in") {
    super(message);
  }
}

/** What a failed use-case looks like to the person: the wire error for the app's adapters. */
export const UNKNOWN_ERROR: ApiErrorWire = { kind: "unknown", message: GENERIC_ERROR_MESSAGE };

/**
 * The one place a domain error becomes a wire error. Both `KorraApi` adapters use it (the web server actions
 * and the in-browser adapter). Returns null for anything that is not a domain error, so the caller can log it
 * and fall back to `UNKNOWN_ERROR`. Uses `instanceof`, never class names (minifiers mangle those).
 */
export function toWireError(e: unknown): ApiErrorWire | null {
  if (e instanceof ValidationError) {
    const fieldErrors = parseFieldErrors(e.message);
    return { kind: "validation", message: e.message, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) };
  }
  if (e instanceof NotFoundError) return { kind: "not_found", message: e.message };
  if (e instanceof UnauthenticatedError) return { kind: "unauthenticated", message: UNAUTHENTICATED_MESSAGE };
  if (e instanceof ForbiddenError) return { kind: "forbidden", message: READ_ONLY_MESSAGE };
  return null;
}
