import "server-only";
import { resolve } from "node:path";
import { createConsoleMailer, createDeps, type Deps } from "@korra/backend";

const g = globalThis as unknown as { __korraDeps?: Promise<Deps> };

/** Dev-only in-memory mode: PGlite + memory blobs + console mailer. Never in production. */
export const isDevInMemory = () => process.env.KORRA_DEV_INMEMORY === "1" && process.env.NODE_ENV !== "production";

/**
 * Memoised Deps. Lazy (never evaluated at module top level) so `next build` needs no env vars.
 * Held on globalThis so dev-mode hot reloads and separate route bundles share one instance.
 */
export function getDeps(): Promise<Deps> {
  g.__korraDeps ??= isDevInMemory() ? createDevDeps() : Promise.resolve(createDeps(process.env));
  return g.__korraDeps;
}

async function createDevDeps(): Promise<Deps> {
  process.env.KORRA_MIGRATIONS_DIR ??= resolve(process.cwd(), "../../packages/db/migrations");
  const { createTestDeps } = await import("@korra/backend/testing");
  const base = `http://localhost:${process.env.PORT ?? "3000"}`;
  const deps = await createTestDeps();
  console.warn("[korra] KORRA_DEV_INMEMORY=1: in-memory database and blob store. Data is lost on restart.");
  // The fake extractor stands in for the LLM: a PDF named demo-invoice.pdf "reads" as this invoice.
  const f = <T,>(value: T | null, confidence = 1) => ({ value, confidence, source: "extracted" as const });
  const usd = (minor: bigint) => ({ minor, currency: "USD" });
  deps.fixtures["demo-invoice.pdf"] = {
    kind: "invoice", rail: null, warnings: [], payments: [],
    invoices: [{
      invoiceNo: f("INV-2026-014"), invoiceDate: f("2026-09-02"), clientName: f("Acme Corp"),
      clientAddress: f("1 Main St, New York"), clientCountry: f("US"), amount: f(usd(150000n)), netRealisableValue: f(usd(150000n)),
      contractRef: f<string>(null, 0), serviceDescription: f("Software development services"), sacCode: f("998314", 0.6),
    }],
  };
  return { ...deps, clock: () => new Date(), mailer: createConsoleMailer(), appUrl: base, authUrl: base };
}
