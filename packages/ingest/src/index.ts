// Isomorphic main entry (`@korra/ingest`): CSV/XLSX parsers, rails, fake extractor. No Node APIs, no Anthropic SDK,
// no "server-only". The Claude extractor is `@korra/ingest/server`; the local PDF extractor is `@korra/ingest/pdf`.
export { createIngester } from "./ingester";
export { createFakeExtractor } from "./fake";
export { IngestError } from "./types";
export type { IngestDoc, IngestResult, LlmExtractor } from "./types";
