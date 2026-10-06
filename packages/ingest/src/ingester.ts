import { LLM_MIME, sniff } from "./sniff";
import { readCsv, readXlsx, type Table } from "./tabular";
import { deelParser } from "./rails/deel";
import { genericParser } from "./rails/generic";
import type { RailParser } from "./rails/rail";
import type { IngestDoc, IngestResult, LlmExtractor } from "./types";

/** Specific rails first; generic is the fallback. Adding Payoneer = adding one entry here. */
const RAIL_PARSERS: RailParser[] = [deelParser];
const MIN_SCORE = 0.5;

const unknown = (warnings: string[]): IngestResult => ({
  kind: "unknown",
  rail: null,
  invoices: [],
  payments: [],
  warnings,
});

function routeTable(table: Table): IngestResult {
  let best: RailParser | null = null;
  let bestScore = 0;
  for (const p of RAIL_PARSERS) {
    const s = p.detect(table.headers);
    if (s >= MIN_SCORE && s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  if (!best && genericParser.detect(table.headers) >= MIN_SCORE) best = genericParser;
  if (!best) {
    return unknown([
      `Unrecognised spreadsheet layout. Headers found: ${table.headers.map((h) => `"${h}"`).join(", ") || "(none)"}. ` +
        "Use the generic template (date, amount, currency, ...) or upload a Deel transaction export.",
    ]);
  }
  const { payments, invoices, warnings } = best.parse(table.rows);
  return { kind: "statement", rail: best.rail, invoices, payments, warnings };
}

export function createIngester(deps: { llm: LlmExtractor }): { ingest(doc: IngestDoc): Promise<IngestResult> } {
  return {
    async ingest(doc) {
      const kind = sniff(doc.bytes, doc.mimeType, doc.filename);
      if (kind === "csv") return routeTable(readCsv(doc.bytes));
      if (kind === "xlsx") {
        try {
          return routeTable(await readXlsx(doc.bytes));
        } catch {
          return unknown(["Could not read this spreadsheet (corrupt or unsupported XLSX)."]);
        }
      }
      if (kind in LLM_MIME) {
        // Pass the real type (from magic bytes), not whatever the client claimed.
        return deps.llm.extract({ ...doc, mimeType: LLM_MIME[kind]! });
      }
      return unknown([
        `Unsupported file type (${doc.mimeType || "unknown"}, ${doc.filename}). Upload a CSV, XLSX, PDF, PNG, JPEG or WEBP.`,
      ]);
    },
  };
}
