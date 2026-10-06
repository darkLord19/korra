import ICAL from "ical.js";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { scheduleEvents } from "@korra/core";
import { caExportFilename, CA_EXPORT_PATHS, packFolders, renderCaExport, type CaExportPack } from "./ca-export";
import { buildCalendar } from "./ics";
import { buildTrackerCsv, type TrackerCsvRow } from "./tracker-csv";

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { ignoreBOM: true }); // keep the BOM
const NOW = new Date(2026, 9, 6, 12, 34, 56); // local time: the README and file name show the local date
const pack = (over: Partial<CaExportPack> = {}): CaExportPack => ({
  month: "2026-09",
  bankName: "Acme Test Bank",
  status: "generated",
  generatedAt: "2026-10-06T09:00:00.000Z",
  submittedAt: null,
  files: [
    { name: "EDF-acme-test-bank-2026-09.pdf", bytes: enc.encode("%PDF-fake") },
    { name: "EDF-acme-test-bank-2026-09.xlsx", bytes: new Uint8Array([0, 1, 2, 250, 255]) },
    { name: "HOW-TO-SUBMIT-acme-test-bank.md", bytes: enc.encode("# How") },
  ],
  ...over,
});
const row: TrackerCsvRow = {
  invoiceNo: "INV-1",
  clientName: "Acme Corp",
  invoiceDate: "2026-09-28",
  amount: { minor: "10000", currency: "USD" },
  realised: { minor: "0", currency: "USD" },
  outstanding: { minor: "10000", currency: "USD" },
  deadline: "2027-06-28",
  status: "open",
  payments: [],
};
const events = scheduleEvents({ months: ["2026-09"], invoices: [{ id: "i1", invoiceNo: "INV-1", deadline: "2027-06-28", status: "open" }] }, "2026-10-06");
const input = (over: Partial<Parameters<typeof renderCaExport>[0]> = {}) => ({ now: NOW, packs: [pack()], trackerRows: [row], events, disclaimer: "DISCLAIMER TEXT", ...over });
const open = async (over = {}) => JSZip.loadAsync(await renderCaExport(input(over)));
const names = (zip: JSZip) => Object.keys(zip.files).sort();

describe("renderCaExport", () => {
  it("has the README, tracker CSV, calendar and each pack's files under packs/<month>-<bank>/", async () => {
    const zip = await open();
    expect(names(zip)).toEqual([
      "README.txt",
      "korra-calendar.ics",
      "packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.pdf",
      "packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.xlsx",
      "packs/2026-09-acme-test-bank/HOW-TO-SUBMIT-acme-test-bank.md",
      "tracker.csv",
    ]);
    expect(names(zip).some((n) => n.startsWith("declarations"))).toBe(false); // reserved for V3
  });

  it("pack files are byte-identical to the input; the CSV and calendar are what the builders produce", async () => {
    const zip = await open();
    expect(Array.from(await zip.file("packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.xlsx")!.async("uint8array"))).toEqual([0, 1, 2, 250, 255]);
    expect(await zip.file("packs/2026-09-acme-test-bank/EDF-acme-test-bank-2026-09.pdf")!.async("string")).toBe("%PDF-fake");
    expect(dec.decode(await zip.file(CA_EXPORT_PATHS.trackerCsv)!.async("uint8array"))).toBe(buildTrackerCsv([row]));
    expect(await zip.file(CA_EXPORT_PATHS.calendar)!.async("string")).toBe(buildCalendar({ events, now: NOW }));
    const cal = new ICAL.Component(ICAL.parse(await zip.file(CA_EXPORT_PATHS.calendar)!.async("string")));
    expect(cal.getAllSubcomponents("vevent")).toHaveLength(events.length);
  });

  it("README says what it is, that it is a copy made locally, and lists packs and the disclaimer", async () => {
    const text = await (await open({ packs: [pack({ status: "submitted", submittedAt: "2026-10-07T01:00:00.000Z" })] })).file("README.txt")!.async("string");
    expect(text).toContain("Made on 2026-10-06");
    expect(text).toMatch(/COPY of the exporter's records/);
    expect(text).toMatch(/not live sharing/);
    expect(text).toMatch(/Nothing was uploaded/);
    expect(text).toContain("tracker.csv");
    expect(text).toContain("korra-calendar.ics");
    expect(text).toContain("packs/2026-09-acme-test-bank/  EDF pack for September 2026, Acme Test Bank. Generated 2026-10-06, marked submitted 2026-10-07.");
    expect(text).toContain("DISCLAIMER TEXT");
    expect(text).not.toContain("Acme Corp"); // client names stay in the CSV
  });

  it("with no packs, tracker rows or events it is still a valid zip", async () => {
    const zip = await open({ packs: [], trackerRows: [], events: [] });
    expect(names(zip)).toEqual(["README.txt", "korra-calendar.ics", "tracker.csv"]);
    expect(await zip.file("README.txt")!.async("string")).toContain("no EDF packs had been generated yet");
  });

  it("the same input gives the same bytes", async () => {
    expect(Array.from(await renderCaExport(input()))).toEqual(Array.from(await renderCaExport(input())));
  });

  it("a pack file named like a path cannot leave its folder", async () => {
    const zip = await open({ packs: [pack({ files: [{ name: "../../evil.txt", bytes: enc.encode("x") }, { name: "..", bytes: enc.encode("y") }] })] });
    const files = names(zip).filter((n) => n.startsWith("packs/"));
    for (const f of files) {
      expect(f.startsWith("packs/2026-09-acme-test-bank/")).toBe(true);
      expect(f.split("/")).not.toContain("..");
    }
    expect(files).toHaveLength(2);
  });
});

describe("packFolders", () => {
  it("two packs for the same month and bank get -2 (oldest keeps the plain name); different banks and months do not clash", () => {
    const a = pack({ generatedAt: "2026-10-06T12:00:00.000Z" });
    const b = pack({ generatedAt: "2026-10-06T09:00:00.000Z" });
    const c = pack({ bankName: "ICICI Bank" });
    const d = pack({ month: "2026-10" });
    expect(packFolders([a, b, c, d])).toEqual(["2026-09-acme-test-bank-2", "2026-09-acme-test-bank", "2026-09-icici-bank", "2026-10-acme-test-bank"]);
  });
});

describe("caExportFilename", () => {
  it("is korra-ca-export-YYYY-MM-DD.zip in the person's local date", () => {
    expect(caExportFilename(new Date(2026, 9, 6, 23, 59))).toBe("korra-ca-export-2026-10-06.zip");
    expect(caExportFilename(new Date(2027, 0, 5, 0, 0))).toBe("korra-ca-export-2027-01-05.zip");
  });
});
