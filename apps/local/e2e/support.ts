import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type BrowserContext, type Locator, type Page, type Request } from "@playwright/test";
import { INVOICE_LINES, makeInvoicePdf } from "./invoice-pdf";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
export const MONTH = "2026-09";

/** The one harmless message PGlite's initdb prints on a cold boot (docs/research/2026-10-06-v0-browser-spike.md). */
const TOLERATED = /ErrnoError/;

export interface Privacy {
  requests: { url: string; method: string }[];
  problems: string[];
  cspViolations: string[];
}

/** Records every request, console error/warning, page error, HTTP error and CSP violation of the page's whole life. */
export async function watchPrivacy(page: Page, context: BrowserContext): Promise<Privacy> {
  const seen: Privacy = { requests: [], problems: [], cspViolations: [] };
  context.on("request", (r: Request) => seen.requests.push({ url: r.url(), method: r.method() }));
  context.on("response", (r) => { if (r.status() >= 400) seen.problems.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !TOLERATED.test(m.text())) seen.problems.push(`console.${m.type()}: ${m.text()} (${m.location().url})`);
  });
  page.on("pageerror", (e) => { if (!TOLERATED.test(String(e)) && !TOLERATED.test(e.name)) seen.problems.push(`pageerror: ${e.message}`); });
  page.on("worker", (w) => {
    w.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !TOLERATED.test(m.text())) seen.problems.push(`worker console.${m.type()}: ${m.text()}`);
    });
  });
  await context.exposeBinding("__cspViolation", (_src, v: string) => { seen.cspViolations.push(v); });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      void (window as unknown as { __cspViolation(v: string): Promise<void> }).__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`);
    });
  });
  return seen;
}

/** Nothing left the origin (blob: URLs minted by it are local), only GETs were sent, no CSP violations, no console errors. */
export function expectPrivate(seen: Privacy, origin: string): void {
  const offOrigin = seen.requests.filter((r) => !(r.url.startsWith(`${origin}/`) || r.url.startsWith(`blob:${origin}/`) || r.url.startsWith("data:")));
  expect(offOrigin, "requests that left the origin").toEqual([]);
  expect(seen.requests.filter((r) => r.method !== "GET"), "non-GET requests").toEqual([]);
  expect(seen.cspViolations, "CSP violations").toEqual([]);
  expect(seen.problems, "console errors and warnings").toEqual([]);
}

export const LANDING_HEADING = "Your export declaration forms, ready for the bank.";

/** The guided flow's pane (its sticky action bar included). There is only ever one, so it is the scope for a flow's buttons: on a desktop the Home list beside it repeats titles. */
export const flow = (page: Page): Locator => page.locator('section[aria-labelledby="flow-title"]');

/** The `?task=` part of a flow's URL (the id is percent-encoded: `upload:2026-09` is `upload%3A2026-09`). */
export const taskUrl = (id: string): RegExp => new RegExp(`/home\\?task=${encodeURIComponent(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/**
 * First run, the way a person does it: landing page, "Get started", the Home hero, then the setup flow. The invoice
 * (a real text-layer PDF, read by pdf.js under the strict CSP) fills in the details; "Is this you?" is confirmed;
 * the bank is picked unless the invoice named one. Ends in the "Add your September invoices" upload flow, with the
 * invoice already filed under its month.
 */
export async function completeSetup(
  page: Page,
  opts: { bankLabel?: string; lines?: string[]; fileName?: string; onSummary?: (summary: Locator) => Promise<void> } = {},
): Promise<void> {
  const bankLabel = opts.bankLabel ?? "Kotak Mahindra Bank";
  await page.goto("/");
  await expect(page.getByRole("heading", { name: LANDING_HEADING })).toBeVisible();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Let's get you set up" })).toBeVisible();
  await page.getByRole("link", { name: "Let's go" }).click();
  await expect(page).toHaveURL(taskUrl("setup"));

  const f = flow(page);
  await expect(f.getByRole("heading", { name: "Drop an invoice" })).toBeVisible();
  const pdf = await makeInvoicePdf(opts.lines ?? INVOICE_LINES);
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: opts.fileName ?? "jane-invoice.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(f.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await opts.onSummary?.(f);
  await f.getByRole("button", { name: /^Looks right/ }).click();

  if (!(await f.getByRole("heading", { name: "Your bank" }).isVisible().catch(() => false))) {
    // The bank came from the invoice: "Looks right, save" saved everything.
  } else {
    await f.getByRole("radio", { name: bankLabel }).click();
    await f.getByRole("button", { name: "Save and continue" }).click();
  }
  await expect(page).toHaveURL(taskUrl(`upload:${MONTH}`));
  await expect(f.getByRole("heading", { name: "Add your September invoices" })).toBeVisible();
  // Wait until the invoice has been read (a reload mid-read only requeues it, minutes later).
  await expect(f.getByRole("button", { name: "Continue" })).toBeEnabled();
}

/** In the upload flow: drop the Deel CSV, wait until it has been read, press Continue (to the review queue, as the invoice has things to check). */
export async function uploadStatementAndContinue(page: Page): Promise<void> {
  const f = flow(page);
  await page.getByTestId("file-input").setInputFiles({ name: "synthetic-transactions.csv", mimeType: "text/csv", buffer: DEEL_CSV });
  await expect(f.getByText("Read ✓")).toBeVisible();
  const next = f.getByRole("button", { name: "Continue" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page).toHaveURL(taskUrl(`review:${MONTH}`));
}

const CLIENT_ADDRESS = "1 Main Street, New York, NY 10001";
const queueCard = (page: Page) => flow(page).getByText(/ is missing its | read .* as the /);

/** One step of the review queue: a missing field is typed in and saved, a read one is confirmed. Waits for the next card (or the end). */
async function reviewStep(page: Page): Promise<void> {
  const f = flow(page);
  const card = queueCard(page);
  const before = await card.first().innerText();
  const missing = /is missing its (.+)$/.exec(before);
  if (missing) {
    expect(missing[1], "the only field the local reader cannot find").toBe("Client address");
    await f.getByLabel("Client address", { exact: true }).fill(CLIENT_ADDRESS);
    await f.getByRole("button", { name: "Save", exact: true }).click();
  } else {
    await f.getByRole("button", { name: "Looks right", exact: true }).click();
  }
  await expect.poll(async () => ((await card.count()) === 0 ? "" : await card.first().innerText().catch(() => "")), { message: "the review queue moves on" }).not.toBe(before);
}

/** Walks the whole review queue to "All checked", then presses "Make my pack". */
export async function finishReview(page: Page): Promise<void> {
  const f = flow(page);
  await expect(queueCard(page).first()).toBeVisible();
  for (let i = 0; i < 40 && (await queueCard(page).count()) > 0; i++) await reviewStep(page);
  await expect(f.getByText("All checked ✓")).toBeVisible();
  await f.getByRole("button", { name: "Make my pack" }).click();
  await expect(page).toHaveURL(/\/home\?task=generate%3A2026-09%3A/);
}

/** Make the pack and, on the Sign step, choose the paper route. Ends on the Send step with the pack's id in the URL. */
export async function makePackSkipSignature(page: Page): Promise<string> {
  const f = flow(page);
  await f.getByRole("button", { name: "Make my pack" }).click();
  await expect(f.getByRole("heading", { name: "Sign your pack" })).toBeVisible();
  const packId = decodeURIComponent(/task=submit%3A([^&]+)$/.exec(page.url())![1]!);
  await f.getByRole("button", { name: "My bank needs a wet signature" }).click();
  await expect(f.getByRole("heading", { name: "Send your pack" })).toBeVisible();
  return packId;
}

/** On the Send step: the four pack files, each a blob: download made in this browser. Returns their names. */
export async function expectPackFiles(page: Page, origin: string): Promise<string[]> {
  const f = flow(page);
  await f.getByText("What's inside").click();
  const downloads = f.getByRole("link", { name: /^Download .+/ });
  await expect(downloads).toHaveCount(4);
  const hrefs = await downloads.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  for (const href of hrefs) expect(href).toMatch(new RegExp(`^blob:${origin}/`));
  return downloads.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).download));
}

/** "I've sent it" then "Mark as sent" (with a bank acknowledgement when `ack` is given), ending on the "All done" celebration. */
export async function markSent(page: Page, ack?: Buffer): Promise<void> {
  const f = flow(page);
  await f.getByRole("button", { name: "I've sent it →" }).click();
  await expect(f.getByRole("heading", { name: "Mark it as sent" })).toBeVisible();
  if (ack) {
    await f.getByTestId("file-input").setInputFiles({ name: "bank-ack.pdf", mimeType: "application/pdf", buffer: ack });
    await expect(f.getByText("Uploaded", { exact: true })).toBeVisible();
  }
  await f.getByRole("button", { name: "Mark as sent" }).click();
  await expect(f.getByRole("heading", { name: "All done" })).toBeVisible();
  await expect(f.getByText("Sent!")).toBeVisible();
}

/** From a finished setup to a generated, wet-signature pack on its Send step: statement, review, make, skip signing. */
export async function generateEdfPack(page: Page, origin: string): Promise<{ packId: string; fileNames: string[] }> {
  await uploadStatementAndContinue(page);
  await finishReview(page);
  const packId = await makePackSkipSignature(page);
  return { packId, fileNames: await expectPackFiles(page, origin) };
}

/** Opens a month's page (`/months?m=`) and one of its disclosures ("Documents (n)" or "Payments & matches"). */
export async function openMonth(page: Page, disclosure?: RegExp | string): Promise<void> {
  await page.goto(`/months?m=${MONTH}`);
  await expect(page.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();
  if (disclosure) await page.locator("summary").filter({ hasText: disclosure }).click();
}

/** Full-mode extras: confirm the proposed match and add a payment by hand (both live under "Payments & matches"). */
export async function addPaymentsAndMatches(page: Page): Promise<void> {
  await openMonth(page, "Payments & matches");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Confirmed \(1\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Add payment by hand" }).click();
  const payForm = page.getByRole("form", { name: "Add payment by hand" });
  await payForm.getByLabel("Payer").fill("Hand Payer Ltd");
  await payForm.getByLabel("Date").fill("2026-09-15");
  await payForm.getByLabel("Foreign amount", { exact: true }).fill("250.50");
  await payForm.getByRole("button", { name: "Save payment" }).click();
  await expect(payForm).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Payer" }).filter({ hasText: "Hand Payer Ltd" })).toBeVisible();
}
