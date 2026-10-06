import type { AdBank, ExporterProfile, Field, InvoiceFacts, Money, PaymentFacts, Allocation } from "./index";
import { money } from "./index";

/** Test-only builders. Not exported from the package entry. */
export const f = <T>(value: T | null, confidence = 1, source: Field<T>["source"] = "extracted"): Field<T> => ({
  value,
  confidence,
  source,
});

export function invoice(
  id: string,
  o: { date?: string | null; amount?: Money | null; client?: string | null; bank?: string } = {},
): InvoiceFacts {
  const amount = o.amount === undefined ? money(100000, "USD") : o.amount;
  return {
    id,
    invoiceNo: f(`INV-${id}`),
    invoiceDate: f(o.date === undefined ? "2026-10-05" : o.date),
    clientName: f(o.client === undefined ? "Acme Inc" : o.client),
    clientAddress: f("1 Main St, NYC"),
    clientCountry: f("US"),
    amount: f(amount),
    netRealisableValue: f(amount),
    contractRef: f<string>(null),
    serviceDescription: f("Software development services"),
    sacCode: f("998314"),
    adBankId: f(o.bank ?? "bank1"),
  };
}

export function payment(
  id: string,
  o: { date?: string | null; amount?: Money | null; payer?: string | null; fees?: Money | null } = {},
): PaymentFacts {
  return {
    id,
    rail: "deel",
    receiptMode: f<"local_transfer" | "swift">("local_transfer"),
    date: f(o.date === undefined ? "2026-10-20" : o.date),
    foreignAmount: f(o.amount === undefined ? money(100000, "USD") : o.amount),
    inrCredited: f<Money>(null),
    fxRate: f<string>(null),
    fees: f(o.fees ?? null),
    firaRef: f<string>(null),
    purposeCode: f("P0802"),
    payerName: f(o.payer === undefined ? "Acme Inc" : o.payer),
    realisingBankName: f<string>(null),
  };
}

export function alloc(
  invoiceId: string,
  paymentId: string,
  amount: Money,
  status: Allocation["status"],
  score = 1,
): Allocation {
  return { invoiceId, paymentId, amount, status, score };
}

export const bank: AdBank = { id: "bank1", name: "HDFC", adCode: "0001234" };
export const exporter: ExporterProfile = {
  legalName: "Jane Dev",
  address: "12 MG Road, Pune",
  pan: "ABCDE1234F",
  gstin: "27ABCDE1234F1Z5",
  iec: null,
  defaultSacCodes: ["998314"],
  defaultAdBankId: "bank1",
};
