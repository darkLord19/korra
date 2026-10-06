import { GENERIC_ERROR_MESSAGE, parseFieldErrors, type ApiErrorKind, type ApiErrorWire } from "@korra/backend/schemas";

// The wire error shape and the field-error parser are shared with the adapters (one implementation, in the backend's client-safe entry).
export { parseFieldErrors };

export type KorraApiErrorKind = ApiErrorKind;

export interface KorraApiErrorInit {
  kind: KorraApiErrorKind;
  message: string;
  /** Field name -> message. For `validation` errors it is parsed from the message when not given. */
  fieldErrors?: ApiErrorWire["fieldErrors"] | undefined;
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

export const GENERIC_ERROR = GENERIC_ERROR_MESSAGE;

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
