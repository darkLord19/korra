import type { SaveProfileInput } from "@korra/backend";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

/** FormData -> saveProfile input (validation happens in the backend schema). */
export function profileFromForm(d: FormData): SaveProfileInput {
  return {
    legalName: str(d, "legalName"),
    address: str(d, "address"),
    pan: str(d, "pan"),
    gstin: str(d, "gstin"),
    iec: str(d, "iec") || null,
    defaultSacCodes: str(d, "defaultSacCodes").split(/[\s,]+/).filter(Boolean),
    defaultAdBankId: str(d, "defaultAdBankId"),
  };
}

/** Submitted string values, echoed back on error so a form keeps what the user typed. */
export const formValues = (d: FormData): Record<string, string> =>
  Object.fromEntries([...d.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
