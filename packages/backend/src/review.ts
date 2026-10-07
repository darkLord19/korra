import { realisationOf, type Allocation, type InvoiceFacts, type PaymentFacts } from "@korra/core";
import type { Ctx } from "./deps-types";
import { NotFoundError, ValidationError } from "./errors";
import {
  FieldValueError,
  MATCH_AFFECTING_FIELDS,
  decideAllocationInput,
  editFieldInput,
  getMonthStateInput,
  linkNocInput,
  parseFieldValue,
  type DecideAllocationInput,
  type EditFieldInput,
} from "./inputs";
import { documentWire, parse, rematch, repos, requireOwner, todayOf } from "./internal";
import { blockersByBank, loadMonth } from "./month";
import { isPlaceholderLayout, layoutIdFor } from "./packs";
import { toWire } from "./wire";
import type { AllocationWire, InvoiceWire, MonthStateWire, PaymentWire, Wire } from "./wire-types";

const invoiceWire = (facts: InvoiceFacts, documentId: string | null): InvoiceWire => ({ ...toWire(facts), documentId });

export async function getMonthState(ctx: Ctx, rawMonth: string): Promise<MonthStateWire> {
  const month = parse(getMonthStateInput, rawMonth);
  const r = repos(ctx);
  const m = await loadMonth(r, month);
  const [payments, links, allAllocations, lastSacCode, docMonths] = await Promise.all([
    r.payments.listByMonth(month), r.payments.links(), r.allocations.list(), r.invoices.lastSacCode(), r.invoices.monthsByDocument(m.documents.map((d) => d.id)),
  ]);
  const invoiceIds = new Set(m.invoices.map((i) => i.facts.id));
  const paymentIds = new Set(payments.map((p) => p.id));
  const allocations = allAllocations.filter((a) => invoiceIds.has(a.invoiceId) || paymentIds.has(a.paymentId));
  const today = todayOf(ctx.deps);

  const realisations: MonthStateWire["realisations"] = {};
  for (const { facts } of m.invoices) {
    if (facts.invoiceDate.value && facts.amount.value) realisations[facts.id] = toWire(realisationOf(facts, allAllocations, today));
  }

  return {
    month,
    documents: m.documents.map((d) => documentWire(d, docMonths[d.id])),
    invoices: m.invoices.map((i) => invoiceWire(i.facts, i.documentId)),
    payments: payments.map((p): PaymentWire => ({ ...toWire(p), documentId: links[p.id]?.documentId ?? null, nocDocumentId: links[p.id]?.nocDocumentId ?? null })),
    allocations: toWire(allocations),
    realisations,
    blockersByBank: blockersByBank(m, ctx.deps.clock()).map((b) => ({ ...b, placeholderLayout: isPlaceholderLayout(layoutIdFor(b.adBankName)) })),
    pendingDocumentIds: m.pendingDocumentIds,
    lastSacCode,
  };
}

export async function editField(ctx: Ctx, raw: EditFieldInput): Promise<Wire<InvoiceFacts> | Wire<PaymentFacts>> {
  requireOwner(ctx);
  const input = parse(editFieldInput, raw);
  let value: unknown;
  try {
    value = parseFieldValue(input.entity, input.field, input.value);
  } catch (e) {
    if (e instanceof FieldValueError) throw new ValidationError(e.message);
    throw e;
  }
  const r = repos(ctx);
  if (input.entity === "invoice" && input.field === "adBankId" && value !== null) {
    if (!(await r.banks.list()).some((b) => b.id === value)) throw new ValidationError("Unknown AD bank");
  }

  const result =
    input.entity === "invoice"
      ? toWire(await r.invoices.updateField(input.id, input.field as keyof InvoiceFacts as never, value as never))
      : toWire(await r.payments.updateField(input.id, input.field as keyof PaymentFacts as never, value as never));
  const affecting: readonly string[] = MATCH_AFFECTING_FIELDS[input.entity];
  if (affecting.includes(input.field)) await rematch(r);
  return result;
}

const OVER_ALLOCATION_NUM = 103n; // 100 % + the 3 % matching tolerance

export async function decideAllocation(ctx: Ctx, raw: DecideAllocationInput): Promise<AllocationWire> {
  requireOwner(ctx);
  const input = parse(decideAllocationInput, raw);
  const r = repos(ctx);
  const all = await r.allocations.list();
  const target = all.find((a) => a.invoiceId === input.invoiceId && a.paymentId === input.paymentId);
  if (!target) throw new NotFoundError("Allocation not found");

  if (input.decision === "confirm") {
    const sum = (pred: (a: Allocation) => boolean) =>
      all.filter((a) => a.status === "confirmed" && pred(a) && a !== target).reduce((s, a) => s + a.amount.minor, 0n);
    const [inv, pay] = await Promise.all([r.invoices.get(input.invoiceId), r.payments.get(input.paymentId)]);
    const invAmount = inv.amount.value;
    if (invAmount && (sum((a) => a.invoiceId === input.invoiceId) + target.amount.minor) * 100n > invAmount.minor * OVER_ALLOCATION_NUM) {
      throw new ValidationError("Confirming this would allocate more than the invoice amount.");
    }
    const payAmount = pay.foreignAmount.value;
    if (payAmount && (sum((a) => a.paymentId === input.paymentId) + target.amount.minor) * 100n > payAmount.minor * OVER_ALLOCATION_NUM) {
      throw new ValidationError("Confirming this would allocate more than the payment amount.");
    }
  }

  await r.allocations.setStatus(input.invoiceId, input.paymentId, input.decision === "confirm" ? "confirmed" : "rejected");
  await rematch(r);
  const after = (await r.allocations.list()).find((a) => a.invoiceId === input.invoiceId && a.paymentId === input.paymentId);
  return toWire(after ?? { ...target, status: input.decision === "confirm" ? ("confirmed" as const) : ("rejected" as const) });
}

/** Attach a NOC document to a payment by hand (when ingest could not match it). */
export async function linkNoc(ctx: Ctx, raw: { paymentId: string; documentId: string }): Promise<void> {
  requireOwner(ctx);
  const input = parse(linkNocInput, raw);
  const r = repos(ctx);
  const doc = await r.documents.get(input.documentId);
  if (doc.kind !== "noc" && doc.kind !== "unknown" && doc.kind !== null) {
    throw new ValidationError("That document is not a NOC.");
  }
  await r.payments.linkNoc(input.paymentId, input.documentId);
}
