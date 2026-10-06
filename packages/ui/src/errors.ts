export type KorraApiErrorKind = "validation" | "not_found" | "forbidden" | "unauthenticated" | "unknown";

export interface KorraApiErrorInit {
  kind: KorraApiErrorKind;
  message: string;
  /** Field name -> message. For `validation` errors it is parsed from the message when not given. */
  fieldErrors?: Record<string, string> | undefined;
}

/** Use-case validation messages look like "field: message; field: message". */
export function parseFieldErrors(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of message.split("; ")) {
    const i = part.indexOf(": ");
    if (i > 0 && /^[\w.]+$/.test(part.slice(0, i))) out[part.slice(0, i).split(".")[0]!] = part.slice(i + 2);
  }
  return out;
}

/** What every `KorraApi` adapter throws. The screens render `message` and `fieldErrors`. */
export class KorraApiError extends Error {
  override name = "KorraApiError";
  readonly kind: KorraApiErrorKind;
  readonly fieldErrors: Record<string, string> | undefined;

  constructor({ kind, message, fieldErrors }: KorraApiErrorInit) {
    super(message);
    this.kind = kind;
    const parsed = fieldErrors ?? (kind === "validation" ? parseFieldErrors(message) : undefined);
    this.fieldErrors = parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
  }
}

export const isKorraApiError = (e: unknown): e is KorraApiError => e instanceof KorraApiError;

export const GENERIC_ERROR = "Something went wrong. Try again.";

/** Text to show a person for any thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof KorraApiError ? e.message : GENERIC_ERROR;
}

/** State for a form's error display. */
export interface FormErrors {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export function toFormErrors(e: unknown): FormErrors {
  if (e instanceof KorraApiError) return { error: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) };
  return { error: GENERIC_ERROR };
}
