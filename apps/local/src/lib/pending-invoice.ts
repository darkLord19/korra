import { currentMonthIST, type InvoiceHandoff, type KorraApi } from "@korra/ui";

// The invoice that filled in the setup form, held in memory (a File cannot go in localStorage) until the month page
// files it. Lost on a reload, which is fine: the person then uploads it on the month page like any other file.
let held: InvoiceHandoff | null = null;
let inflight: Promise<string | null> | null = null;

export function holdInvoice(invoice: InvoiceHandoff | undefined): void {
  held = invoice ?? null;
}

/**
 * Files the held invoice (if any) under the month of its invoice date, so the person does not upload it a second time.
 * Resolves with that month, or null when nothing was held or the upload failed (the month page still works).
 * The held file is taken before the upload starts, and a second call while it runs gets the same promise
 * (StrictMode runs effects twice), so the file is uploaded at most once.
 */
export function fileHeldInvoice(api: KorraApi): Promise<string | null> {
  if (inflight) return inflight;
  const invoice = held;
  held = null;
  if (!invoice) return Promise.resolve(null);
  const month = invoice.month ?? currentMonthIST();
  const run = api.uploadFile(invoice.file, { month, hint: "invoice" }).then(
    () => month,
    (e: unknown) => { console.error("[korra] could not file the invoice from setup", e); return null; },
  );
  inflight = run;
  void run.then(() => { if (inflight === run) inflight = null; });
  return run;
}
