import "server-only";
import { notFound, redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { ForbiddenError, NotFoundError, READ_ONLY_MESSAGE, UnauthenticatedError, ValidationError, parseFieldErrors } from "@korra/backend";

export type { FormState };

/** For pages: a missing/forbidden record becomes the 404 page; anything else is rethrown. */
export function notFoundOrThrow(e: unknown): never {
  if (e instanceof NotFoundError) notFound();
  throw e;
}

/**
 * Maps backend errors for server actions / pages:
 * ValidationError -> returned state; NotFound -> notFound(); Unauthenticated -> /sign-in; Forbidden -> message.
 */
export function toFormState(e: unknown): FormState {
  if (e instanceof ValidationError) {
    const fieldErrors = parseFieldErrors(e.message);
    return { error: e.message, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) };
  }
  if (e instanceof NotFoundError) notFound();
  if (e instanceof UnauthenticatedError) redirect("/sign-in");
  if (e instanceof ForbiddenError) return { error: READ_ONLY_MESSAGE };
  throw e;
}
