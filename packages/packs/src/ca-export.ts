import JSZip from "jszip";
import type { ScheduleEvent, YearMonth } from "@korra/core";
import { buildCalendar } from "./ics";
import { buildTrackerCsv, type TrackerCsvRow } from "./tracker-csv";
import { bankSlug, monthLabel, stripControls } from "./util";
import { dedupeNames } from "./zip";

/**
 * Layout of the zip (so later additions are new folders, not a restructure):
 *
 *   README.txt
 *   tracker.csv
 *   korra-calendar.ics
 *   packs/<month>-<bank>/<every file of that pack, as stored>
 *   declarations/   reserved for realisation declarations (V3); absent until they exist
 */
export const CA_EXPORT_PATHS = { readme: "README.txt", trackerCsv: "tracker.csv", calendar: "korra-calendar.ics", packsDir: "packs" } as const;

export interface CaExportPack {
  month: YearMonth;
  bankName: string;
  status: "generated" | "submitted";
  /** ISO timestamps, as stored. */
  generatedAt: string;
  submittedAt: string | null;
  files: { name: string; bytes: Uint8Array }[];
}

export interface CaExportInput {
  /** When the export is made. */
  now: Date;
  packs: CaExportPack[];
  trackerRows: TrackerCsvRow[];
  events: ScheduleEvent[];
  /** The product's standard disclaimer sentence, repeated in the README. */
  disclaimer: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The person's local calendar date (what the filename and the README both show). */
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `korra-ca-export-YYYY-MM-DD.zip`, in the person's local calendar date (like the backup file). */
export function caExportFilename(date: Date): string {
  return `korra-ca-export-${localDate(date)}.zip`;
}

/** A path segment that cannot climb out of its folder or smuggle in a separator. */
const segment = (s: string): string => {
  const clean = stripControls(s).replace(/[\\/]+/g, "_").trim();
  return clean === "" || /^\.+$/.test(clean) ? "_" : clean;
};

/** `<month>-<bank>` folders, oldest pack first; a second pack for the same month and bank gets `-2`, `-3`, ... */
export function packFolders(packs: CaExportPack[]): string[] {
  const order = packs.map((_, i) => i).sort((a, b) => (packs[a]!.generatedAt < packs[b]!.generatedAt ? -1 : packs[a]!.generatedAt > packs[b]!.generatedAt ? 1 : a - b));
  const names = dedupeNames(order.map((i) => `${packs[i]!.month}-${bankSlug(packs[i]!.bankName)}`));
  const out: string[] = new Array<string>(packs.length);
  order.forEach((packIndex, k) => { out[packIndex] = names[k]!; });
  return out;
}

const dateOnly = (iso: string): string => iso.slice(0, 10);

function readme(input: CaExportInput, folders: string[]): string {
  const { now, packs, trackerRows, events, disclaimer } = input;
  const made = localDate(now);
  const eventCount = events.length;
  const packLines = packs.length === 0
    ? ["  (no EDF packs had been generated yet)"]
    : packs
        .map((p, i) => ({ p, folder: folders[i]! }))
        .sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
        .map(({ p, folder }) => `  ${CA_EXPORT_PATHS.packsDir}/${folder}/  EDF pack for ${monthLabel(p.month)}, ${p.bankName}. Generated ${dateOnly(p.generatedAt)}, ${p.submittedAt ? `marked submitted ${dateOnly(p.submittedAt)}` : "not marked submitted"}.`);
  return [
    "Korra export for my CA",
    "======================",
    "",
    `Made on ${made}, on the exporter's own device, in their browser. Nothing was uploaded: Korra has no server.`,
    "",
    "This is a COPY of the exporter's records as they were on that date. It is not live sharing: it does not update when the exporter changes anything in Korra, and Korra cannot see or change this file.",
    "",
    "What is in this zip",
    "",
    `  ${CA_EXPORT_PATHS.trackerCsv}  The realisation tracker, one row per declared invoice (${trackerRows.length} now): invoice number, client, invoice date, EDF month, currency, invoice / realised / outstanding amounts, the realisation due date, the status and the confirmed payments behind the realised amount. Amounts are in major units. Status is as of ${made}.`,
    `  ${CA_EXPORT_PATHS.calendar}  A calendar file (${eventCount} entries): the EDF due date of each month, and the realisation deadline of each unrealised invoice with 60 and 30 day alerts. It holds invoice numbers and dates only. Import it into a calendar app.`,
    `  ${CA_EXPORT_PATHS.packsDir}/  Every EDF pack the exporter generated (${packs.length}), one folder per month and bank, with the files exactly as Korra produced them: the EDF form (PDF), the spreadsheet, the supporting documents (zip) and the how-to-submit guide.`,
    ...packLines,
    "",
    "Realisation is due 9 months after the invoice date (12 months for invoices in INR).",
    "",
    disclaimer,
    "",
  ].join("\r\n");
}

/**
 * The "Export for my CA" zip, entirely in memory. Pure: every input is passed in, nothing is read or fetched here.
 * Entry dates are `now`, so the same input gives the same bytes.
 */
export async function renderCaExport(input: CaExportInput): Promise<Uint8Array> {
  const folders = packFolders(input.packs);
  const zip = new JSZip();
  const opts = { date: input.now, createFolders: false } as const;

  zip.file(CA_EXPORT_PATHS.readme, readme(input, folders), opts);
  zip.file(CA_EXPORT_PATHS.trackerCsv, buildTrackerCsv(input.trackerRows), opts);
  zip.file(CA_EXPORT_PATHS.calendar, buildCalendar({ events: input.events, now: input.now }), opts);
  input.packs.forEach((p, i) => {
    const names = dedupeNames(p.files.map((f) => segment(f.name)));
    p.files.forEach((f, j) => zip.file(`${CA_EXPORT_PATHS.packsDir}/${segment(folders[i]!)}/${names[j]!}`, f.bytes, opts));
  });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
