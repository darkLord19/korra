// Local PDF extractor (`@korra/ingest/pdf`): the third `LlmExtractor` adapter. Reads the PDF text layer with pdf.js
// (loaded lazily, worker URL supplied by the app) and applies rules. Nothing leaves the device.
import { sniff } from "./sniff";
import { extractFromText, SCANNED_WARNING } from "./local-rules";
import { IngestError, type LlmExtractor } from "./types";

export { extractFromText, SCANNED_WARNING, LOCAL_CONFIDENCE } from "./local-rules";

export interface LocalPdfExtractorOptions {
  /** Text of the PDF, one string per line or chunk. Tests inject this; production uses pdf.js. */
  getTextLayer?: (bytes: Uint8Array) => Promise<string[]>;
  /** URL of the pdf.js worker, served from the app's own origin (e.g. "/pdfjs/pdf.worker.min.mjs"). */
  workerSrc?: string;
}

/** pdf.js text layer, grouped into visual lines by baseline. */
export async function pdfjsTextLayer(bytes: Uint8Array, workerSrc?: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    throw new IngestError("The PDF reader is not configured (no worker URL).", { retryable: false, code: "no_pdf_worker" });
  }
  // pdfjs-dist 5.x has no eval fast path, so no unsafe-eval in the CSP. `slice()`: pdf.js transfers the buffer.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      let line = "";
      let y: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const iy = item.transform[5] as number;
        if (y !== null && Math.abs(iy - y) > 2 && line) {
          lines.push(line);
          line = "";
        }
        y = iy;
        line += (line && item.str && !line.endsWith(" ") && !item.str.startsWith(" ") ? " " : "") + item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
          y = null;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  } finally {
    await doc.destroy();
  }
}

export function createLocalPdfExtractor(opts: LocalPdfExtractorOptions = {}): LlmExtractor {
  const getTextLayer = opts.getTextLayer ?? ((bytes: Uint8Array) => pdfjsTextLayer(bytes, opts.workerSrc));
  return {
    async extract(doc) {
      const kind = sniff(doc.bytes, doc.mimeType, doc.filename);
      if (kind !== "pdf") {
        return { kind: "unknown", rail: null, invoices: [], payments: [], warnings: [SCANNED_WARNING] };
      }
      let chunks: string[];
      try {
        chunks = await getTextLayer(doc.bytes);
      } catch (e) {
        if (e instanceof IngestError) throw e;
        throw new IngestError("Could not read this PDF. Enter the details by hand.", { retryable: false, code: "unreadable_pdf", cause: e });
      }
      return extractFromText(chunks, doc.hint);
    },
  };
}
