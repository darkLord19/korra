import { describe, expect, it, vi } from "vitest";
import { currentMonthIST, type KorraApi } from "@korra/ui";
import { fileHeldInvoice, holdInvoice } from "./pending-invoice";

const file = new File(["%PDF-1.4"], "inv.pdf", { type: "application/pdf" });
const apiWith = (uploadFile: unknown) => ({ uploadFile }) as unknown as KorraApi;

describe("the invoice that filled in the setup form", () => {
  it("is filed once, under the invoice's month, as an invoice", async () => {
    const uploadFile = vi.fn().mockResolvedValue({ documentId: "d1" });
    holdInvoice({ file, month: "2026-09" });
    // two calls at once (StrictMode runs the effect twice): one upload
    const [a, b] = await Promise.all([fileHeldInvoice(apiWith(uploadFile)), fileHeldInvoice(apiWith(uploadFile))]);
    expect([a, b]).toEqual(["2026-09", "2026-09"]);
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(uploadFile).toHaveBeenCalledWith(file, { month: "2026-09", hint: "invoice" });
    // and once it is done there is nothing left to file
    expect(await fileHeldInvoice(apiWith(uploadFile))).toBeNull();
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it("falls back to the current month when the invoice has no readable date", async () => {
    const uploadFile = vi.fn().mockResolvedValue({ documentId: "d1" });
    holdInvoice({ file, month: null });
    expect(await fileHeldInvoice(apiWith(uploadFile))).toBe(currentMonthIST());
  });

  it("does nothing when no invoice was held, and a failed upload is logged, not thrown", async () => {
    const uploadFile = vi.fn();
    holdInvoice(undefined);
    expect(await fileHeldInvoice(apiWith(uploadFile))).toBeNull();
    expect(uploadFile).not.toHaveBeenCalled();

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    holdInvoice({ file, month: "2026-09" });
    expect(await fileHeldInvoice(apiWith(vi.fn().mockRejectedValue(new Error("full"))))).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect(await fileHeldInvoice(apiWith(uploadFile))).toBeNull(); // it is not retried
  });
});
