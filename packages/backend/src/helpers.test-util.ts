import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Field, InvoiceFacts, Money, PaymentFacts } from "@korra/core";
import type { IngestResult } from "@korra/ingest";
import { confirmUpload, requestUpload, runIngest, saveBank, saveProfile } from "./index";
import type { Ctx } from "./deps-types";
import { simulateBrowserPut, type TestDeps } from "./testing";

export const f = <T>(value: T | null, confidence = 1, source: Field<T>["source"] = "extracted"): Field<T> => ({ value, confidence, source });
export const usd = (major: number) => ({ minor: BigInt(Math.round(major * 100)), currency: "USD" });

export const PDF = new TextEncoder().encode("%PDF-1.4 fake");
export const deelCsv = () =>
  new Uint8Array(readFileSync(fileURLToPath(new URL("../../ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url))));

export function invoiceResult(over: Partial<Omit<InvoiceFacts, "id" | "adBankId">> = {}): IngestResult {
  return {
    kind: "invoice",
    rail: null,
    warnings: [],
    payments: [],
    invoices: [
      {
        invoiceNo: f("INV-2026-014"),
        invoiceDate: f("2026-09-02"),
        clientName: f("Acme Corp"),
        clientAddress: f("1 Main St, New York"),
        clientCountry: f("US"),
        amount: f(usd(1500)),
        netRealisableValue: f(usd(1500)),
        inrEquivalent: { value: null, confidence: 0, source: "default" },
        contractRef: f<string>(null, 0),
        serviceDescription: f("Software development services"),
        sacCode: f("998314"),
        ...over,
      },
    ],
  };
}

export function firaResult(over: Partial<Omit<PaymentFacts, "id">> = {}): IngestResult {
  return {
    kind: "fira",
    rail: "generic",
    warnings: [],
    invoices: [],
    payments: [
      {
        rail: "generic",
        receiptMode: f<"swift">("swift", 0.95),
        date: f("2026-09-21", 0.95),
        foreignAmount: f(usd(2000), 0.95),
        inrCredited: f<Money>(null, 0),
        fxRate: f<string>(null, 0),
        fees: f<Money>(null, 0),
        firaRef: f("FIRA-777", 0.95),
        purposeCode: f("P0802", 0.95),
        payerName: f<string>(null, 0),
        realisingBankName: f("HDFC Bank", 0.9),
        ...over,
      },
    ],
  };
}

export async function onboard(ctx: Ctx, bankName = "Acme Test Bank") {
  const bank = await saveBank(ctx, { name: bankName, adCode: "6390001" });
  await saveProfile(ctx, {
    legalName: "Jane Dev",
    address: "12 MG Road, Bengaluru",
    pan: "ABCDE1234F",
    gstin: "29ABCDE1234F1Z5",
    defaultSacCodes: ["998314"],
    defaultAdBankId: bank.id,
  });
  return bank;
}

/** requestUpload -> browser PUT -> confirmUpload -> runIngest. Returns the document id. */
export async function upload(
  deps: TestDeps,
  ctx: Ctx,
  file: { filename: string; mimeType: string; bytes: Uint8Array; month: string; hint?: "invoice" | "statement" | "fira" | "noc" | "ack" },
  opts: { ingest?: boolean } = {},
): Promise<string> {
  const req = await requestUpload(ctx, { filename: file.filename, mimeType: file.mimeType as never, sizeBytes: file.bytes.byteLength, month: file.month, ...(file.hint ? { hint: file.hint } : {}) });
  simulateBrowserPut(deps.blobs, { url: req.uploadUrl, token: req.token }, file.bytes);
  await confirmUpload(ctx, req.documentId);
  if (opts.ingest !== false) await runIngest(deps, req.documentId);
  return req.documentId;
}
