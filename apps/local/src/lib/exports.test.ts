import JSZip from "jszip";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { createInvoiceManually, createPaymentManually, decideAllocation, generatePack, getMonthState, getPackDownloads, getTracker, markPackSubmitted, saveBank, saveProfile } from "@korra/backend";
import { createTestDeps, createTestOwner } from "@korra/backend/testing";
import { caExportFilename, renderCaExport } from "@korra/packs";
import { calendarEventsOf, collectCaExport, scheduleSourceOf, todayIST } from "./exports";

const FIELDS = {
  invoiceNo: "INV-77",
  invoiceDate: "2026-09-05",
  clientName: "Acme Corp",
  clientAddress: "1 Main St, New York",
  clientCountry: "US",
  amount: { minor: "150000", currency: "USD" },
  netRealisableValue: { minor: "150000", currency: "USD" },
  serviceDescription: "Software development services",
  sacCode: "998314",
};
const PAY = { receiptMode: "swift", date: "2026-09-21", foreignAmount: { minor: "150000", currency: "USD" }, firaRef: "FIRA-9", purposeCode: "P0802", payerName: "Acme Corp" };

/** A realised invoice with its payment, an open invoice, a submitted pack; the clock is 2026-11-02. */
async function seed() {
  const deps = await createTestDeps();
  const { ctx } = await createTestOwner(deps);
  const bank = await saveBank(ctx, { name: "Acme Test Bank", adCode: "6390001" });
  await saveProfile(ctx, { legalName: "Jane Dev", address: "12 MG Road, Bengaluru", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", defaultSacCodes: ["998314"], defaultAdBankId: bank.id });
  const { id: realised } = await createInvoiceManually(ctx, { month: "2026-09", fields: FIELDS });
  const { id: open } = await createInvoiceManually(ctx, { month: "2026-09", fields: { ...FIELDS, invoiceNo: "INV-78", clientName: "=cmd|' /C calc'!A0", amount: { minor: "250000", currency: "USD" }, netRealisableValue: { minor: "250000", currency: "USD" } } });
  await createPaymentManually(ctx, { fields: PAY });
  const proposal = (await getMonthState(ctx, "2026-09")).allocations.find((a) => a.invoiceId === realised)!;
  await decideAllocation(ctx, { invoiceId: realised, paymentId: proposal.paymentId, decision: "confirm" });
  const pack = await generatePack(ctx, { month: "2026-09", adBankId: bank.id });
  if (!pack.ok) throw new Error(`pack blocked: ${JSON.stringify(pack.blockers)}`);
  await markPackSubmitted(ctx, { packId: pack.packId });
  return { deps, ctx, realised, open, packId: pack.packId };
}

describe("todayIST", () => {
  it("is India's calendar day, whatever the machine's time zone", () => {
    expect(todayIST(new Date("2026-10-05T20:00:00Z"))).toBe("2026-10-06"); // 01:30 IST
    expect(todayIST(new Date("2026-10-06T18:29:59Z"))).toBe("2026-10-06");
    expect(todayIST(new Date("2026-10-06T18:30:00Z"))).toBe("2026-10-07");
  });
});

describe("the calendar's source and the CSV rows", () => {
  it("come from the same tracker the screen shows", async () => {
    const { ctx, realised, open } = await seed();
    const tracker = await getTracker(ctx);
    const source = scheduleSourceOf(tracker);
    expect(source.months).toEqual(["2026-09"]);
    expect(source.invoices.map((i) => [i.invoiceNo, i.status, i.deadline])).toEqual(
      expect.arrayContaining([["INV-77", "realised", "2027-06-05"], ["INV-78", "open", "2027-06-05"]]),
    );
    // Nothing but id, number, deadline and status reaches the calendar.
    for (const i of source.invoices) expect(Object.keys(i).sort()).toEqual(["deadline", "id", "invoiceNo", "status"]);
    // Only the open invoice has realisation events; the month always has its EDF date.
    const events = calendarEventsOf(tracker, new Date(2026, 10, 2, 12, 0, 0));
    expect(events.filter((e) => e.uid.includes(open)).map((e) => e.kind).sort()).toEqual(["realisation_alert", "realisation_alert", "realisation_deadline"]);
    expect(events.some((e) => e.uid.includes(realised))).toBe(false);
    expect(events.find((e) => e.kind === "edf_due")).toMatchObject({ month: "2026-09", date: "2026-10-30" });
  });
});

describe("collectCaExport + renderCaExport (integration, in memory)", () => {
  it("zips the pack's files, the tracker CSV, the calendar and a README", async () => {
    const { deps, ctx, packId } = await seed();
    const now = new Date(2026, 10, 2, 12, 0, 0); // local noon: the README shows the local date
    const input = await collectCaExport(ctx, deps.blobs, now);
    const zip = await JSZip.loadAsync(await renderCaExport(input));
    const names = Object.keys(zip.files).sort();

    expect(names).toEqual([
      "README.txt",
      "korra-calendar.ics",
      "packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.pdf",
      "packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.xlsx",
      "packs/2026-09-acme-test-bank/HOW-TO-SUBMIT-acme-test-bank.md",
      "packs/2026-09-acme-test-bank/supporting-2026-09.zip",
      "tracker.csv",
    ]);

    // Pack files are byte-identical to what the pack screen downloads (same blobs).
    const stored = await getPackDownloads(ctx, packId);
    for (const f of stored.files) {
      const key = `u/${ctx.actor.userId}/packs/${packId}/${f.name}`;
      expect(Array.from(await zip.file(`packs/2026-09-acme-test-bank/${f.name}`)!.async("uint8array"))).toEqual(Array.from(await deps.blobs.get(key)));
    }

    const csv = (await zip.file("tracker.csv")!.async("string")).replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    expect(csv[0]).toBe("Invoice no.,Client,Invoice date,EDF month,Currency,Invoice amount,Realised amount,Outstanding amount,Realisation due date,Status,Matched payments");
    expect(csv).toContain("INV-77,Acme Corp,2026-09-05,2026-09,USD,1500.00,1500.00,0.00,2027-06-05,Realised,2026-09-21 USD 1500.00 (ref FIRA-9)");
    // The client name that looks like a formula is defused.
    expect(csv.find((l) => l.startsWith("INV-78,"))).toBe("INV-78,'=cmd|' /C calc'!A0,2026-09-05,2026-09,USD,2500.00,0.00,2500.00,2027-06-05,Open,");

    const cal = new ICAL.Component(ICAL.parse(await zip.file("korra-calendar.ics")!.async("string")));
    const summaries = cal.getAllSubcomponents("vevent").map((e) => String(e.getFirstPropertyValue("summary")));
    expect(summaries).toEqual(expect.arrayContaining(["EDF due: September 2026 invoices", "Realisation deadline: INV-78"]));
    expect(summaries.some((s) => s.includes("INV-77"))).toBe(false); // realised
    const calText = await zip.file("korra-calendar.ics")!.async("string");
    for (const secret of ["Acme", "ABCDE1234F", "cmd", "1500", "2500"]) expect(calText).not.toContain(secret);

    const readme = await zip.file("README.txt")!.async("string");
    expect(readme).toContain("Made on 2026-11-02");
    expect(readme).toContain("marked submitted");
    expect(readme).toContain("Korra prepares documents; you or your CA submit them.");
    expect(caExportFilename(new Date(2026, 10, 2))).toBe("korra-ca-export-2026-11-02.zip");
  });

  it("an owner with no packs gets a valid, mostly empty zip", async () => {
    const deps = await createTestDeps();
    const { ctx } = await createTestOwner(deps);
    const zip = await JSZip.loadAsync(await renderCaExport(await collectCaExport(ctx, deps.blobs, new Date(2026, 10, 2, 12, 0, 0))));
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "korra-calendar.ics", "tracker.csv"]);
  });
});
