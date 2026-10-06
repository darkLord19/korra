// Isomorphic entry (`@korra/ingest/iso`): CSV/XLSX parsers, rails, fake extractor. No Node APIs, no Anthropic SDK,
// no "server-only". The Claude extractor is exported from index.ts only.
export { createIngester } from "./ingester";
export { createFakeExtractor } from "./fake";
export { IngestError } from "./types";
export type { IngestDoc, IngestResult, LlmExtractor } from "./types";
