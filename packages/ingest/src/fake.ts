import type { IngestResult, LlmExtractor } from "./types";

/** Test double: canned results keyed by filename; unknown filenames come back as kind "unknown". */
export function createFakeExtractor(fixtures: Record<string, IngestResult>): LlmExtractor {
  return {
    async extract(doc) {
      return (
        fixtures[doc.filename] ?? {
          kind: "unknown",
          rail: null,
          invoices: [],
          payments: [],
          warnings: [`No fixture for "${doc.filename}".`],
        }
      );
    },
  };
}
