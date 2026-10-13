import { panFromGstin } from "@korra/core";

/**
 * The PAN to show after the GSTIN changed. A full GSTIN carries the PAN, so it is filled in when the PAN is still
 * empty; a PAN the person already typed is kept. Returns the PAN unchanged otherwise.
 */
export function panForGstinChange(gstin: string, pan: string): string {
  const fromGstin = panFromGstin(gstin);
  return fromGstin && !pan.trim() ? fromGstin : pan;
}

/** The PAN inside the GSTIN when a complete PAN was typed that disagrees with it, else null (no warning to show). */
export function panMismatch(gstin: string, pan: string): string | null {
  const fromGstin = panFromGstin(gstin);
  return fromGstin !== null && pan.trim().length === 10 && pan.trim().toUpperCase() !== fromGstin ? fromGstin : null;
}
