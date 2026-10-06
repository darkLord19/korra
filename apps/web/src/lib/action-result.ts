import type { KorraApiErrorKind } from "@korra/ui";

/** What the KorraApi server actions return: never a thrown backend error. The client adapter turns `error` into a KorraApiError. */
export type ActionError = { kind: KorraApiErrorKind; message: string; fieldErrors?: Record<string, string> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
