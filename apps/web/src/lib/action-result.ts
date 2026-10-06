import type { ApiErrorWire } from "@korra/backend/schemas";

/** What the KorraApi server actions return: never a thrown backend error. The client adapter turns `error` into a KorraApiError. */
export type ActionError = ApiErrorWire;
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
