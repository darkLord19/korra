// pdf.js text-layer extraction with the worker self-hosted from /pdfjs (public/). Dynamically imported.
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

export async function extractText(bytes: Uint8Array): Promise<{ pages: number; text: string; ms: number }> {
  const t = performance.now();
  // pdfjs-dist 5.x has no eval fast path (the isEvalSupported option is gone), so no unsafe-eval in the CSP.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c = await page.getTextContent();
    text += c.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { pages, text, ms: performance.now() - t };
}
