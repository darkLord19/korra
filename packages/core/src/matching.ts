import { pctToBps } from "./bps";
import { diffDays } from "./dates";
import type { Allocation, InvoiceFacts, IsoDate, Money, PaymentFacts } from "./types";

export interface MatchTolerance {
  amountPct: number; // default 0.03, covering rail fees and FX spread on foreignAmount vs invoice amount
  dateWindowDays: number; // default: payment between invoiceDate - 7 and invoiceDate + 270
}

export interface MatchProposal {
  allocations: Allocation[]; // existing confirmed and rejected allocations stay as they are; new ones are "proposed"
  unmatchedInvoiceIds: string[]; // still declared; they go to the tracker as Open
  unmatchedPaymentIds: string[];
}

/** Shared with realisation: an invoice is realised when outstanding <= this share of its amount. */
export const DEFAULT_AMOUNT_TOLERANCE_PCT = 0.03;
export const DEFAULT_DATE_WINDOW_DAYS = 270;

/** A payment may arrive up to this many days before the invoice date. */
const DATE_LEAD_DAYS = 7;
/** Combined score below this is not proposed. */
const MIN_SCORE = 0.6;
const W_AMOUNT = 0.6;
const W_NAME = 0.3;
const W_DATE = 0.1;
/** Name similarity used when either side has no usable name. */
const NEUTRAL_NAME = 0.5;
const MAX_SUBSET = 6;
/** Bounds subset-sum search (C(24,<=6) is about 190k combinations). */
const MAX_SUBSET_POOL = 24;

const NAME_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "ltd", "limited", "gmbh", "pvt", "private", "corp",
  "corporation", "co", "company", "plc", "ag", "sa", "bv", "pte", "srl", "oy", "ab", "the",
]);

function nameTokens(name: string | null): Set<string> {
  if (name === null) return new Set();
  const tokens = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t !== "" && !NAME_SUFFIXES.has(t));
  return new Set(tokens);
}

/** Overlap coefficient of normalised name tokens; null when either side has no tokens. */
function nameSimilarity(a: string | null, b: string | null): number | null {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return null;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

function clientKey(name: string | null): string | null {
  const t = [...nameTokens(name)].sort();
  return t.length === 0 ? null : t.join(" ");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

interface Inv {
  id: string;
  date: IsoDate;
  client: string | null;
  ccy: string;
  outstanding: bigint;
}
interface Pay {
  id: string;
  date: IsoDate;
  payer: string | null;
  ccy: string;
  remaining: bigint;
  /** Values this payment can stand for: remaining, and remaining + fees when untouched and fees share the currency. */
  values: bigint[];
}

export function proposeMatches(
  invoices: InvoiceFacts[],
  payments: PaymentFacts[],
  existing: Allocation[],
  tolerance?: Partial<MatchTolerance>,
): MatchProposal {
  const amountPct = tolerance?.amountPct ?? DEFAULT_AMOUNT_TOLERANCE_PCT;
  const windowDays = tolerance?.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS;
  const bps = pctToBps(amountPct);

  const kept = existing.filter((a) => a.status !== "proposed");
  const rejected = new Set(kept.filter((a) => a.status === "rejected").map((a) => `${a.invoiceId}|${a.paymentId}`));
  const confirmedByInvoice = new Map<string, bigint>();
  const confirmedByPayment = new Map<string, bigint>();
  for (const a of kept) {
    if (a.status !== "confirmed") continue;
    confirmedByInvoice.set(a.invoiceId, (confirmedByInvoice.get(a.invoiceId) ?? 0n) + a.amount.minor);
    confirmedByPayment.set(a.paymentId, (confirmedByPayment.get(a.paymentId) ?? 0n) + a.amount.minor);
  }

  const sortedInvoices = [...invoices].sort((a, b) => cmp(a.id, b.id));
  const sortedPayments = [...payments].sort((a, b) => cmp(a.id, b.id));

  const skippedInvoiceIds: string[] = [];
  const invs: Inv[] = [];
  for (const inv of sortedInvoices) {
    const date = inv.invoiceDate.value;
    const amount = inv.amount.value;
    if (date === null || amount === null) {
      skippedInvoiceIds.push(inv.id);
      continue;
    }
    const outstanding = amount.minor - (confirmedByInvoice.get(inv.id) ?? 0n);
    if (outstanding * 10_000n <= bps * amount.minor) {
      continue; // fully confirmed (within tolerance): nothing left to match
    }
    invs.push({ id: inv.id, date, client: inv.clientName.value, ccy: amount.currency, outstanding });
  }

  const skippedPaymentIds: string[] = [];
  const pays: Pay[] = [];
  for (const p of sortedPayments) {
    const date = p.date.value;
    const amount = p.foreignAmount.value;
    if (date === null || amount === null) {
      skippedPaymentIds.push(p.id);
      continue;
    }
    const confirmed = confirmedByPayment.get(p.id) ?? 0n;
    const remaining = amount.minor - confirmed;
    if (remaining <= 0n) continue;
    const values = [remaining];
    const fees: Money | null = p.fees.value;
    if (confirmed === 0n && fees !== null && fees.currency === amount.currency && fees.minor > 0n) {
      values.push(remaining + fees.minor);
    }
    pays.push({ id: p.id, date, payer: p.payerName.value, ccy: amount.currency, remaining, values });
  }

  // --- scoring helpers -----------------------------------------------------------------

  const inWindow = (inv: Inv, pay: Pay): boolean => {
    const d = diffDays(inv.date, pay.date);
    return d >= -DATE_LEAD_DAYS && d <= windowDays;
  };
  /** 1 at the invoice date falling to 0.5 at the end of the window. */
  const dateScore = (inv: Inv, pay: Pay): number => {
    const d = Math.max(0, diffDays(inv.date, pay.date));
    return windowDays === 0 ? 1 : 1 - 0.5 * Math.min(1, d / windowDays);
  };
  const nameScore = (client: string | null, payer: string | null): number =>
    nameSimilarity(client, payer) ?? NEUTRAL_NAME;
  const hasNameConflict = (client: string | null, payer: string | null): boolean =>
    nameSimilarity(client, payer) === 0;
  /** Within tolerance of the invoice-side amount? */
  const within = (invoiceSide: bigint, diff: bigint): boolean => diff * 10_000n <= bps * invoiceSide;
  /** 1 on an exact amount falling to 0.5 at the tolerance edge. */
  const amountScore = (invoiceSide: bigint, diff: bigint): number => {
    if (diff === 0n) return 1;
    const denom = Number(bps * invoiceSide);
    return denom === 0 ? 0 : 1 - 0.5 * Math.min(1, Number(diff * 10_000n) / denom);
  };
  const combine = (amount: number, name: number, date: number): number =>
    round(W_AMOUNT * amount + W_NAME * name + W_DATE * date);

  // --- state ---------------------------------------------------------------------------

  const usedInvoices = new Set<string>();
  const usedPayments = new Set<string>();
  const proposed: Allocation[] = [];
  const emit = (inv: Inv, pay: Pay, amount: bigint, score: number): void => {
    proposed.push({
      invoiceId: inv.id,
      paymentId: pay.id,
      amount: { minor: amount, currency: inv.ccy },
      score,
      status: "proposed",
    });
  };
  const allowed = (inv: Inv, pay: Pay): boolean =>
    inv.ccy === pay.ccy && !rejected.has(`${inv.id}|${pay.id}`) && inWindow(inv, pay);

  /** The payment value closest to `target`. */
  const closest = (pay: Pay, target: bigint): { value: bigint; diff: bigint } => {
    let best = { value: pay.values[0]!, diff: abs(pay.values[0]! - target) };
    for (const v of pay.values.slice(1)) {
      const diff = abs(v - target);
      if (diff < best.diff) best = { value: v, diff };
    }
    return best;
  };

  // --- 1. one-to-one -------------------------------------------------------------------

  interface Cand { inv: Inv; pay: Pay; value: bigint; score: number }
  const cands: Cand[] = [];
  for (const inv of invs) {
    for (const pay of pays) {
      if (!allowed(inv, pay)) continue;
      const { value, diff } = closest(pay, inv.outstanding);
      if (!within(inv.outstanding, diff)) continue;
      const score = combine(amountScore(inv.outstanding, diff), nameScore(inv.client, pay.payer), dateScore(inv, pay));
      if (score >= MIN_SCORE) cands.push({ inv, pay, value, score });
    }
  }
  cands.sort((a, b) => b.score - a.score || cmp(a.inv.id, b.inv.id) || cmp(a.pay.id, b.pay.id));
  for (const c of cands) {
    if (usedInvoices.has(c.inv.id) || usedPayments.has(c.pay.id)) continue;
    usedInvoices.add(c.inv.id);
    usedPayments.add(c.pay.id);
    emit(c.inv, c.pay, c.value < c.inv.outstanding ? c.value : c.inv.outstanding, c.score);
  }

  // --- subset search -------------------------------------------------------------------

  interface Item { id: string; value: bigint }
  /**
   * Smallest-difference subset (size 2..MAX_SUBSET) of `items` whose sum is within tolerance of
   * `target`. `itemsAreInvoices` decides which side the tolerance is relative to. Ties break on
   * the joined ids. Assumes positive values (enables pruning).
   */
  const bestSubset = (
    items: Item[],
    target: bigint,
    itemsAreInvoices: boolean,
  ): { ids: string[]; diff: bigint } | null => {
    let best = null as { ids: string[]; diff: bigint; key: string } | null;
    const chosen: Item[] = [];
    const walk = (start: number, sum: bigint): void => {
      if (chosen.length >= 2) {
        const diff = abs(sum - target);
        const ok = within(itemsAreInvoices ? sum : target, diff);
        if (ok) {
          const ids = chosen.map((c) => c.id);
          const key = ids.join(",");
          if (best === null || diff < best.diff || (diff === best.diff && key < best.key)) {
            best = { ids, diff, key };
          }
        }
      }
      if (chosen.length === MAX_SUBSET) return;
      for (let i = start; i < items.length; i++) {
        const next = sum + items[i]!.value;
        // prune: sum already too large, and values are positive so it only grows
        const tooBig = itemsAreInvoices
          ? next * (10_000n - bps) > target * 10_000n
          : next * 10_000n > target * (10_000n + bps);
        if (tooBig) continue; // items are sorted ascending by value, but ids order matters; skip only this one
        chosen.push(items[i]!);
        walk(i + 1, next);
        chosen.pop();
      }
    };
    walk(0, 0n);
    return best === null ? null : { ids: best.ids, diff: best.diff };
  };
  const byValueThenId = (a: Item, b: Item): number =>
    a.value < b.value ? -1 : a.value > b.value ? 1 : cmp(a.id, b.id);

  // --- 2. one payment covering several invoices of the same client ---------------------

  const invById = new Map(invs.map((i) => [i.id, i]));
  const payById = new Map(pays.map((p) => [p.id, p]));

  for (const pay of pays) {
    if (usedPayments.has(pay.id)) continue;
    const groups = new Map<string, Inv[]>();
    for (const inv of invs) {
      if (usedInvoices.has(inv.id) || !allowed(inv, pay) || hasNameConflict(inv.client, pay.payer)) continue;
      const key = clientKey(inv.client);
      if (key === null) continue;
      const g = groups.get(key);
      if (g) g.push(inv);
      else groups.set(key, [inv]);
    }
    let best = null as { ids: string[]; diff: bigint; sim: number; target: bigint } | null;
    for (const key of [...groups.keys()].sort()) {
      const group = groups.get(key)!;
      if (group.length < 2) continue;
      const pool = group.slice(0, MAX_SUBSET_POOL);
      const items = pool.map((i) => ({ id: i.id, value: i.outstanding })).sort(byValueThenId);
      const sim = nameScore(group[0]!.client, pay.payer);
      for (const target of pay.values) {
        const hit = bestSubset(items, target, true);
        if (hit === null) continue;
        if (
          best === null ||
          sim > best.sim ||
          (sim === best.sim && (hit.diff < best.diff || (hit.diff === best.diff && hit.ids.join() < best.ids.join())))
        ) {
          best = { ids: hit.ids, diff: hit.diff, sim, target };
        }
      }
    }
    if (best === null) continue;
    const chosen = best.ids.map((id) => invById.get(id)!).sort((a, b) => cmp(a.id, b.id));
    const total = chosen.reduce((s, i) => s + i.outstanding, 0n);
    const score = combine(
      amountScore(total, best.diff),
      best.sim,
      chosen.reduce((s, i) => s + dateScore(i, pay), 0) / chosen.length,
    );
    if (score < MIN_SCORE) continue;
    let left = best.target;
    usedPayments.add(pay.id);
    for (const inv of chosen) {
      const amount = inv.outstanding < left ? inv.outstanding : left;
      left -= amount;
      usedInvoices.add(inv.id);
      emit(inv, pay, amount, score);
    }
  }

  // --- 3. one invoice covered by several partial payments ------------------------------

  for (const inv of invs) {
    if (usedInvoices.has(inv.id)) continue;
    const pool = pays
      .filter((p) => !usedPayments.has(p.id) && allowed(inv, p) && !hasNameConflict(inv.client, p.payer))
      .slice(0, MAX_SUBSET_POOL);
    if (pool.length < 2) continue;
    // each payment contributes its plain remaining (fees are not added for partials)
    const items = pool.map((p) => ({ id: p.id, value: p.remaining })).sort(byValueThenId);
    const hit = bestSubset(items, inv.outstanding, false);
    if (hit === null) continue;
    const chosen = hit.ids.map((id) => payById.get(id)!).sort((a, b) => cmp(a.id, b.id));
    const score = combine(
      amountScore(inv.outstanding, hit.diff),
      chosen.reduce((s, p) => s + nameScore(inv.client, p.payer), 0) / chosen.length,
      chosen.reduce((s, p) => s + dateScore(inv, p), 0) / chosen.length,
    );
    if (score < MIN_SCORE) continue;
    let left = inv.outstanding;
    usedInvoices.add(inv.id);
    for (const pay of chosen) {
      const amount = pay.remaining < left ? pay.remaining : left;
      left -= amount;
      usedPayments.add(pay.id);
      emit(inv, pay, amount, score);
    }
  }

  // --- result --------------------------------------------------------------------------

  const allocations = [...kept, ...proposed].sort(
    (a, b) => cmp(a.invoiceId, b.invoiceId) || cmp(a.paymentId, b.paymentId) || cmp(a.status, b.status),
  );
  const unmatchedInvoiceIds = [
    ...skippedInvoiceIds,
    ...invs.filter((i) => !usedInvoices.has(i.id)).map((i) => i.id),
  ].sort(cmp);
  const unmatchedPaymentIds = [
    ...skippedPaymentIds,
    ...pays.filter((p) => !usedPayments.has(p.id)).map((p) => p.id),
  ].sort(cmp);
  return { allocations, unmatchedInvoiceIds, unmatchedPaymentIds };
}
