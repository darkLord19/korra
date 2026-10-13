import { describe, expect, it } from "vitest";
import type { BlockerWire, PackWire } from "@korra/backend/schemas";
import { invoice, monthState } from "../test-utils";
import { monthNextStep, monthStage } from "./stage";

const banks = (blockers: BlockerWire[], adBankId = "bank1") => [{ adBankId, adBankName: "Acme Test Bank", placeholderLayout: false, blockers }];
const pack = (over: Partial<PackWire> = {}): PackWire => ({
  id: "p1", month: "2026-09", adBankId: "bank1", layoutId: "l", status: "generated", files: [], generatedAt: "2026-10-01T00:00:00Z", submittedAt: null, ...over,
});
const flagged: BlockerWire = { kind: "flagged_field", entity: "invoice", id: "inv1", field: "sacCode", confidence: 0.6 };

describe("monthStage", () => {
  it("is 'nothing' with no invoices and no pack", () => {
    expect(monthStage(monthState({ blockersByBank: banks([{ kind: "no_invoices" }]) }), [])).toBe("nothing");
    expect(monthStage(monthState(), [])).toBe("nothing");
  });
  it("is 'check' for a flagged field or a missing invoice field", () => {
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: banks([flagged]) }), [])).toBe("check");
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: banks([{ kind: "missing_field", entity: "invoice", id: "inv1", field: "clientAddress" }]) }), [])).toBe("check");
  });
  it("counts a missing profile field or a file still being read as 'check' too, but not the empty-bank blocker", () => {
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: banks([{ kind: "missing_field", entity: "exporter", id: "x", field: "pan" }]) }), [])).toBe("check");
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: [...banks([]), ...banks([{ kind: "no_invoices" }], "bank2")] }), [])).toBe("ready");
  });
  it("is 'ready' with invoices, no blockers and no pack", () => {
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: banks([]) }), [])).toBe("ready");
  });
  it("is 'not_sent' while any pack is only generated", () => {
    const state = monthState({ invoices: [invoice()], blockersByBank: banks([]) });
    expect(monthStage(state, [pack()])).toBe("not_sent");
    expect(monthStage(state, [pack({ status: "submitted" }), pack({ id: "p2" })])).toBe("not_sent");
  });
  it("is 'sent' when every pack was submitted, whatever else is going on", () => {
    expect(monthStage(monthState({ invoices: [invoice()], blockersByBank: banks([flagged]) }), [pack({ status: "submitted" })])).toBe("sent");
  });
});

describe("monthNextStep", () => {
  it("adds invoices to an empty month", () => {
    expect(monthNextStep("2026-09", monthState(), [])).toEqual({ label: "Add invoices", to: { task: "upload:2026-09" } });
  });
  it("counts the checks, once per invoice field across banks", () => {
    const state = monthState({ invoices: [invoice()], blockersByBank: [...banks([flagged]), ...banks([flagged], "bank2")] });
    expect(monthNextStep("2026-09", state, [])).toEqual({ label: "Check 1 thing", to: { task: "review:2026-09" } });
    const two = monthState({ invoices: [invoice()], blockersByBank: banks([flagged, { ...flagged, field: "amount" }]) });
    expect(monthNextStep("2026-09", two, [])?.label).toBe("Check 2 things");
  });
  it("sends a missing profile to settings, and offers nothing while a file is being read", () => {
    const profile = monthState({ invoices: [invoice()], blockersByBank: banks([{ kind: "missing_field", entity: "exporter", id: "x", field: "pan" }]) });
    expect(monthNextStep("2026-09", profile, [])).toEqual({ label: "Finish your details", to: { settings: true } });
    const pending = monthState({ invoices: [invoice()], blockersByBank: banks([{ kind: "document_pending", documentId: "d1" }]) });
    expect(monthNextStep("2026-09", pending, [])).toBeNull();
  });
  it("makes the pack for the first bank that has none, sends a generated one, and is done when sent", () => {
    const ready = monthState({ invoices: [invoice()], blockersByBank: banks([]) });
    expect(monthNextStep("2026-09", ready, [])).toEqual({ label: "Make my pack", to: { task: "generate:2026-09:bank1" } });
    expect(monthNextStep("2026-09", ready, [pack({ id: "p9" })])).toEqual({ label: "Send your pack", to: { task: "submit:p9" } });
    expect(monthNextStep("2026-09", ready, [pack({ status: "submitted" })])).toBeNull();
  });
});
