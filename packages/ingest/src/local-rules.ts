// Rules-based reader for the text layer of invoices, FIRAs and NOCs (client-only v0: no network, no LLM).
// Pure and isomorphic: it takes text lines and returns an IngestResult. Every extracted value gets
// LOCAL_CONFIDENCE, which is below FLAG_THRESHOLD (0.9), so the user must review each one before a pack is built.
import type { Field, InvoiceFacts, IsoDate, Money, PaymentFacts } from "@korra/core";
import { field, missing, parseAmount, parseDate, parseRate } from "./normalize";
import type { IngestResult } from "./types";

export const LOCAL_CONFIDENCE = 0.6;
export const SCANNED_WARNING = "Scanned or image file: enter the details by hand";

const f = <T>(v: T | null): Field<T> => field(v, LOCAL_CONFIDENCE);

/* ------------------------------ vocabulary ------------------------------ */

const ISO_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED", "JPY", "CHF", "NZD", "SEK", "NOK", "DKK", "HKD", "CNY", "ZAR",
  "SAR", "QAR", "KWD", "BHD", "OMR", "ILS", "PLN", "CZK", "HUF", "BRL", "MXN", "THB", "MYR", "IDR", "PHP", "KRW", "TRY",
] as const;
const CCY_RE = new RegExp(`\\b(${ISO_CURRENCIES.join("|")})\\b`);
const SYMBOL_CCY: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

const COUNTRIES: [string, string][] = [
  ["united states of america", "US"], ["united states", "US"], ["usa", "US"], ["u.s.a", "US"], ["u.s.", "US"],
  ["united kingdom", "GB"], ["great britain", "GB"], ["england", "GB"], ["scotland", "GB"], ["uk", "GB"], ["u.k.", "GB"],
  ["united arab emirates", "AE"], ["uae", "AE"], ["dubai", "AE"], ["germany", "DE"], ["france", "FR"], ["netherlands", "NL"],
  ["the netherlands", "NL"], ["canada", "CA"], ["australia", "AU"], ["singapore", "SG"], ["ireland", "IE"], ["spain", "ES"],
  ["italy", "IT"], ["sweden", "SE"], ["norway", "NO"], ["denmark", "DK"], ["finland", "FI"], ["switzerland", "CH"],
  ["austria", "AT"], ["belgium", "BE"], ["portugal", "PT"], ["poland", "PL"], ["estonia", "EE"], ["lithuania", "LT"],
  ["japan", "JP"], ["new zealand", "NZ"], ["israel", "IL"], ["south africa", "ZA"], ["brazil", "BR"], ["mexico", "MX"],
  ["hong kong", "HK"], ["china", "CN"], ["south korea", "KR"], ["saudi arabia", "SA"], ["qatar", "QA"], ["malaysia", "MY"],
  ["thailand", "TH"], ["indonesia", "ID"], ["philippines", "PH"], ["turkey", "TR"], ["india", "IN"],
].sort((a, b) => b[0]!.length - a[0]!.length) as [string, string][];

/* ------------------------------ text helpers ------------------------------ */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MONTH_NAME = "[A-Za-z]{3,9}";
const DATE_PATTERNS = [
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/,
  /\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/,
  new RegExp(`${MONTH_NAME}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}`),
  new RegExp(`\\d{1,2}(?:st|nd|rd|th)?[\\s-]+${MONTH_NAME}\\.?,?[\\s-]+\\d{4}`),
];

/** Earliest parsable date inside `text`, in any of the supported formats. */
export function findDate(text: string): IsoDate | null {
  let best: { at: number; v: IsoDate } | null = null;
  for (const re of DATE_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, "g"))) {
      const p = parseDate(m[0]);
      if (p && (!best || m.index < best.at)) best = { at: m.index, v: p.value };
    }
  }
  return best?.v ?? null;
}

/** Currency named in `text`: an ISO code, or a symbol ($ = USD, € , £, ₹). */
export function findCurrency(text: string): string | null {
  const code = text.match(CCY_RE)?.[1];
  const sym = text.match(/US\$|[$€£₹]/)?.[0];
  const firstCode = code ? text.indexOf(code) : Infinity;
  const firstSym = sym ? text.indexOf(sym) : Infinity;
  if (firstCode === Infinity && firstSym === Infinity) return null;
  return firstCode <= firstSym ? code! : sym === "US$" ? "USD" : SYMBOL_CCY[sym!]!;
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/** The last number on the text read as an amount in the currency named in it (or `fallback`). */
export function findMoney(text: string, fallback: string | null = null): Money | null {
  const ccy = findCurrency(text) ?? fallback;
  if (!ccy) return null;
  const nums = text.match(NUMBER_RE);
  if (!nums) return null;
  return parseAmount(nums[nums.length - 1]!, ccy)?.value ?? null;
}

interface Hit {
  /** Text after the label on its own line (never empty), or the next line when the label stands alone. */
  value: string;
  index: number;
}

/** First line carrying one of the labels. The value is what follows it on the line, else the next line. */
function labelled(lines: string[], labels: RegExp, from = 0): Hit | null {
  const re = new RegExp(`(?:${labels.source})\\s*(?:[:#\\-–]|\\bis\\b)?\\s*(.*)$`, "i");
  for (let i = from; i < lines.length; i++) {
    const m = lines[i]!.match(re);
    if (!m) continue;
    const rest = (m[1] ?? "").trim();
    if (rest) return { value: rest, index: i };
    const next = lines.slice(i + 1).find((l) => l.trim());
    if (next) return { value: next.trim(), index: i };
  }
  return null;
}

/** First token of `value` that looks like an identifier (must contain a digit). */
function idToken(value: string): string | null {
  for (const m of value.matchAll(/[A-Za-z0-9][A-Za-z0-9\-/_.]*[A-Za-z0-9]|[A-Za-z0-9]/g)) {
    if (/\d/.test(m[0])) return m[0];
  }
  return null;
}

export function toLines(chunks: string[]): string[] {
  return chunks
    .flatMap((c) => c.split(/\r?\n/))
    .map((l) => l.replace(/[\u00a0\t]+/g, " ").replace(/ {2,}/g, " ").trim())
    .filter(Boolean);
}

/* ------------------------------ classification ------------------------------ */

function firaSignals(text: string): number {
  let n = 0;
  if (/foreign\s+inward\s+remittance/i.test(text)) n++;
  if (/\bFIRA\b|\bFIRC\b|inward\s+remittance\s+(?:advice|certificate)/i.test(text)) n++;
  if (/purpose\s+(?:code|of\s+remittance)/i.test(text)) n++;
  if (/\bP0[0-9]{3}\b/.test(text)) n++;
  return n;
}

export function classify(text: string, hint?: string): "fira" | "noc" | "invoice" {
  if (hint === "fira" || hint === "noc" || hint === "invoice") return hint;
  const fira = firaSignals(text);
  const noc = /no[\s-]+objection/i.test(text);
  if (noc && fira < 2) return "noc"; // a NOC may mention the remittance it covers
  if (fira >= 2) return "fira";
  return noc ? "noc" : "invoice";
}

/* ------------------------------ invoice ------------------------------ */

const TOTAL_PRIORITY: [RegExp, number][] = [
  [/\b(?:grand\s+total|total\s+due|amount\s+due|balance\s+due|total\s+payable|amount\s+payable)\b/i, 2],
  [/\b(?:invoice\s+total|total\s+amount|total)\b/i, 1],
];

function invoiceTotal(lines: string[], docCcy: string | null): Money | null {
  let best: { m: Money; prio: number; at: number } | undefined;
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]!;
    if (/sub\s*-?\s*total|tax|gst|vat|discount/i.test(line)) continue;
    for (const [re, prio] of TOTAL_PRIORITY) {
      const hit = line.match(re);
      if (!hit) continue;
      let rest = line.slice(hit.index! + hit[0].length);
      if (!/\d/.test(rest)) rest = lines[at + 1] ?? ""; // value on the next line
      const m = findMoney(rest, docCcy);
      if (m && m.minor > 0n && (!best || prio > best.prio || (prio === best.prio && at > best.at))) best = { m, prio, at };
      break;
    }
  }
  return best?.m ?? null;
}

function clientBlock(lines: string[]): { name: string | null; block: string[] } {
  const re = /\b(?:bill(?:ed)?\s+to|client|customer|invoice\s+to|sold\s+to)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(re);
    if (!m) continue;
    const same = lines[i]!.slice(m.index! + m[0].length)
      .replace(/^\s*(?:(?:name|company)\s*)?[:\-–]?\s*/i, "")
      .trim();
    const after = lines.slice(i + 1, i + 7);
    if (same) return { name: same, block: [same, ...after] };
    const [name, ...rest] = after;
    if (name) return { name, block: [name, ...rest] };
  }
  return { name: null, block: [] };
}

function countryOf(block: string[]): string | null {
  const text = block.join("\n").toLowerCase();
  for (const [name, code] of COUNTRIES) {
    if (new RegExp(`(?<![a-z])${esc(name)}(?![a-z])`).test(text)) return code;
  }
  if (/,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(block.join("\n"))) return "US";
  return null;
}

function serviceDescription(lines: string[]): string | null {
  const direct = labelled(lines, /\b(?:description\s+of\s+services?|service\s+description|description)\b(?=\s*[:\-–]\s*\S)/);
  // Drop trailing quantity / rate / amount cells ("... 1 $1,500.00 $1,500.00"); a bare year like 2026 stays.
  const cell = /^(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\.\d+|\d{1,3}(?:,\d{3})+|\d{1,3}%?|[$€£₹]|[A-Z]{3})$/;
  const clean = (s: string) => {
    const t = s.trim().split(/\s+/);
    while (t.length > 1 && cell.test(t[t.length - 1]!) && (!/^[A-Z]{3}$/.test(t[t.length - 1]!) || findCurrency(t[t.length - 1]!))) t.pop();
    return t.join(" ").replace(/[\s,;:–-]+$/, "").trim();
  };
  if (direct) return clean(direct.value) || null;
  const h = lines.findIndex((l) => /\bdescription\b/i.test(l) && /\b(?:qty|quantity|rate|amount|hours|price|unit)\b/i.test(l));
  if (h < 0) return null;
  for (const l of lines.slice(h + 1, h + 6)) {
    if (/sub\s*-?\s*total|total|tax|gst|vat|balance|amount\s+due/i.test(l)) return null;
    const c = clean(l);
    if (/[A-Za-z]{3}/.test(c)) return c;
  }
  return null;
}

function sacCode(lines: string[]): string | null {
  const re = /(?<![\d.,])(99\d{4})(?!\d|[.,]\d)/;
  const tagged = lines.find((l) => /\b(?:SAC|HSN|service\s+accounting)\b/i.test(l) && re.test(l));
  return (tagged ?? lines.find((l) => re.test(l)))?.match(re)?.[1] ?? null;
}

function readInvoice(lines: string[]): IngestResult {
  const text = lines.join("\n");
  const docCcy = findCurrency(text);

  const noHit = labelled(lines, /\b(?:invoice\s*(?:no\.?|number|num|id)|inv\s*(?:no\.?|#)|invoice\s*[#:])/);
  const invoiceNo = (noHit && idToken(noHit.value)) ?? text.match(/\b(INV[-/_]?[A-Z0-9][A-Z0-9\-/_]*)/i)?.[1] ?? null;

  const dateHit = labelled(lines, /\b(?:invoice\s+date|date\s+of\s+issue|issue\s+date|issued(?:\s+on)?|(?<!due\s)(?<!payment\s)dated?)\b/);
  const invoiceDate =
    (dateHit && findDate(dateHit.value)) ??
    findDate(lines.filter((l) => !/\b(?:due|payment\s+terms|period)\b/i.test(l)).join("\n"));

  const total = invoiceTotal(lines, docCcy);
  const client = clientBlock(lines);
  const sac = sacCode(lines);
  const desc = serviceDescription(lines);

  const inv: Omit<InvoiceFacts, "id" | "adBankId"> = {
    invoiceNo: f(invoiceNo),
    invoiceDate: f(invoiceDate),
    clientName: f(client.name),
    clientAddress: f<string>(null),
    clientCountry: f(countryOf(client.block)),
    amount: f(total),
    netRealisableValue: f(total),
    inrEquivalent: { value: null, confidence: 0, source: "default" },
    contractRef: f<string>(null),
    serviceDescription: f(desc),
    sacCode: f(sac),
  };
  const warnings = ["Read from the PDF text on this device. Check every field before you use it."];
  if (!invoiceNo) warnings.push("Could not find the invoice number.");
  if (!invoiceDate) warnings.push("Could not find the invoice date.");
  if (!total) warnings.push("Could not find the invoice total.");
  return { kind: "invoice", rail: null, invoices: [inv], payments: [], warnings };
}

/* ------------------------------ FIRA ------------------------------ */

function readFira(lines: string[]): IngestResult {
  const text = lines.join("\n");

  const refHit = labelled(lines, /\b(?:FIRA|FIRC)\s*(?:no\.?|number|ref(?:erence)?(?:\s*(?:no\.?|number))?)|\b(?:certificate|reference|transaction\s+reference|remittance\s+ref(?:erence)?)\s*(?:no\.?|number)\b|\bUTR\b/);
  const firaRef = refHit ? idToken(refHit.value) : null;

  const purposeCode = text.match(/\b(P\d{4})\b/)?.[1] ?? null;

  const foreignHit = labelled(lines, /\b(?:foreign\s+currency\s+amount|amount\s+in\s+foreign\s+currency|fcy\s+amount|remittance\s+amount|amount\s+(?:received|remitted)|foreign\s+amount)\b/);
  const foreign = foreignHit ? findMoney(foreignHit.value, findCurrency(text.replace(/\bINR\b/g, ""))) : null;
  const foreignAmount = foreign && foreign.currency !== "INR" ? foreign : null;

  const inrHit = labelled(lines, /\b(?:amount\s+in\s+inr|inr\s+(?:amount|equivalent|credited)|rupee\s+(?:amount|equivalent)|amount\s+credited|credited\s+amount)\b/);
  const inrRaw = inrHit ? findMoney(inrHit.value.replace(/\bRs\.?/gi, "INR"), "INR") : null;
  const inrCredited = inrRaw && inrRaw.currency === "INR" ? inrRaw : null;

  const rateHit = labelled(lines, /\b(?:exchange\s+rate|fx\s+rate|conversion\s+rate|rate\s+of\s+exchange)\b/);
  const rateNum = rateHit?.value.match(/\d[\d,]*(?:\.\d+)?/g)?.pop();
  const fxRate = rateNum ? parseRate(rateNum) : null;

  const dateHit = labelled(lines, /\b(?:date\s+of\s+(?:credit|remittance|receipt)|credit\s+date|value\s+date|date\s+of\s+issue|fira\s+date|date)\b/);
  const date = (dateHit && findDate(dateHit.value)) ?? findDate(text);

  const remitter = labelled(lines, /\b(?:name\s+of\s+(?:the\s+)?remitter|remitter(?:'s)?\s*(?:name)?|ordering\s+customer|sender(?:'s)?\s*(?:name)?|remitting\s+party)\b/)?.value ?? null;
  const bank = lines.slice(0, 6).find((l) => /\bbank\b/i.test(l) && l.length < 80) ?? null;

  const payment: Omit<PaymentFacts, "id"> = {
    rail: "generic",
    receiptMode: f<"swift">("swift"),
    date: f(date),
    foreignAmount: f(foreignAmount),
    inrCredited: f(inrCredited),
    fxRate: f(fxRate),
    fees: missing<Money>(),
    firaRef: f(firaRef),
    purposeCode: f(purposeCode),
    payerName: f(remitter),
    realisingBankName: f(bank),
  };
  const warnings = ["Read from the PDF text on this device. Check every field before you use it."];
  if (!foreignAmount) warnings.push("Could not find the foreign currency amount.");
  return { kind: "fira", rail: "generic", invoices: [], payments: [payment], warnings };
}

/* ------------------------------ NOC ------------------------------ */

function readNoc(lines: string[]): IngestResult {
  const text = lines.join("\n");
  const refHit = labelled(lines, /\b(?:noc\s*(?:no\.?|number|ref(?:erence)?)|ref(?:erence)?\s*(?:no\.?|number)?|letter\s+no\.?|our\s+ref)\b/);
  const amountHit = labelled(lines, /\b(?:amount|sum\s+of)\b/);
  const amount = (amountHit && findMoney(amountHit.value)) || null;
  const date = findDate(text);
  return {
    kind: "noc",
    nocRef: { reference: refHit ? idToken(refHit.value) : null, amount, date },
    rail: null,
    invoices: [],
    payments: [],
    warnings: ["Read from the PDF text on this device. Check the NOC is linked to the right payment."],
  };
}

/* ------------------------------ entry ------------------------------ */

/** Turns the text layer of a PDF into an IngestResult. Empty text means a scanned PDF. */
export function extractFromText(chunks: string[], hint?: string): IngestResult {
  const lines = toLines(chunks);
  if (lines.join("").length < 20) {
    return { kind: "unknown", rail: null, invoices: [], payments: [], warnings: [SCANNED_WARNING] };
  }
  const kind = classify(lines.join("\n"), hint);
  return kind === "fira" ? readFira(lines) : kind === "noc" ? readNoc(lines) : readInvoice(lines);
}
