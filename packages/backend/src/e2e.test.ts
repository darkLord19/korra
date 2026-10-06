import { describe, expect, it } from "vitest";
import {
  acceptCaInvite, decideAllocation, deleteAccount, editField, generatePack, getMonthState, getPackDownloads,
  getTracker, inviteCa,
} from "./index";
import { caCtx, createTestDeps, createTestOwner } from "./testing";
import { PDF, deelCsv, f, invoiceResult, onboard, upload } from "./helpers.test-util";

describe("end to end", () => {
  it("onboard -> upload -> ingest -> match -> confirm -> blocked -> fix -> pack -> tracker -> CA -> delete", async () => {
    const deps = await createTestDeps({ now: "2026-10-05T08:00:00Z" });
    const owner = await createTestOwner(deps, "jane@example.test");
    const ca = await createTestOwner(deps, "ca@firm.test");
    const bank = await onboard(owner.ctx, "Generic Bank");

    // The Deel statement (3 withdrawals) and an invoice matching the 1,500 USD one. The SAC code is low confidence.
    await upload(deps, owner.ctx, { filename: "deel.csv", mimeType: "text/csv", bytes: deelCsv(), month: "2026-09" });
    deps.fixtures["acme-invoice.pdf"] = invoiceResult({ sacCode: f("998314", 0.6) });
    const invoiceDoc = await upload(deps, owner.ctx, { filename: "acme-invoice.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });

    let st = await getMonthState(owner.ctx, "2026-09");
    expect(st.documents.map((d) => d.status)).toEqual(["ingested", "ingested"]);
    expect(st.payments).toHaveLength(3);
    expect(st.allocations).toHaveLength(1);
    const alloc = st.allocations[0]!;
    expect(alloc.status).toBe("proposed");

    await decideAllocation(owner.ctx, { invoiceId: alloc.invoiceId, paymentId: alloc.paymentId, decision: "confirm" });

    // blocked by the flagged field
    expect(st.blockersByBank[0]!.blockers).toEqual([
      { kind: "flagged_field", entity: "invoice", id: alloc.invoiceId, field: "sacCode", confidence: 0.6 },
    ]);
    expect(await generatePack(owner.ctx, { month: "2026-09", adBankId: bank.id })).toEqual({
      ok: false,
      blockers: [{ kind: "flagged_field", entity: "invoice", id: alloc.invoiceId, field: "sacCode", confidence: 0.6 }],
    });

    await editField(owner.ctx, { entity: "invoice", id: alloc.invoiceId, field: "sacCode", value: "998314" });
    st = await getMonthState(owner.ctx, "2026-09");
    expect(st.blockersByBank[0]!.blockers).toEqual([]);

    const pack = await generatePack(owner.ctx, { month: "2026-09", adBankId: bank.id });
    if (!pack.ok) throw new Error(JSON.stringify(pack));
    expect(pack).toMatchObject({ layoutId: "generic", placeholder: false });

    const dl = await getPackDownloads(owner.ctx, pack.packId);
    expect(dl.files.map((x) => x.name)).toEqual([
      "EDF-generic-bank-2026-09.pdf", "EDF-generic-bank-2026-09.xlsx", "supporting-2026-09.zip", "HOW-TO-SUBMIT-generic-bank.md",
    ]);
    expect(dl.files.every((x) => x.url.startsWith("memory://download/"))).toBe(true);
    // the invoice document is in the supporting zip: the zip is non-trivial and stored
    expect(deps.blobs.keys().filter((k) => k.startsWith(`u/${owner.id}/packs/${pack.packId}/`))).toHaveLength(4);
    const zipKey = deps.blobs.keys().find((k) => k.endsWith(".zip"))!;
    expect(Buffer.from(await deps.blobs.get(zipKey)).includes("acme-invoice.pdf")).toBe(true);
    expect(invoiceDoc).toBeTruthy();

    const tracker = await getTracker(owner.ctx);
    expect(tracker.rows[0]!.realisation.status).toBe("realised");
    expect(tracker.totals.outstanding).toEqual([]);

    // CA
    await inviteCa(owner.ctx, "ca@firm.test");
    const token = /token=([^\s]+)/.exec(deps.mailer.sent.at(-1)!.text)![1]!;
    await acceptCaInvite(ca.ctx, decodeURIComponent(token));
    const cx = caCtx(deps, ca.id, owner.id);
    expect((await getPackDownloads(cx, pack.packId)).files).toHaveLength(4);
    expect((await getTracker(cx)).rows).toHaveLength(1);

    // delete
    const keysBefore = deps.blobs.keys().filter((k) => k.startsWith(`u/${owner.id}/`));
    expect(keysBefore.length).toBeGreaterThanOrEqual(6);
    expect(await deleteAccount(owner.ctx)).toEqual({ deletedBlobs: keysBefore.length });
    expect(deps.blobs.keys().filter((k) => k.startsWith(`u/${owner.id}/`))).toEqual([]);
  });
});
