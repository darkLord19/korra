import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";
import { makeInvoicePdf } from "./invoice-pdf";

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

/** First run: "/" leads to onboarding; add a bank, fill in the profile, land on the month. Then a reload remembers it. */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
  await page.getByLabel("Bank name").fill("Acme Test Bank");
  await page.getByLabel("AD code").fill("6390001");
  await page.getByRole("button", { name: "Add bank" }).click();
  await expect(page.getByText("AD code 6390001")).toBeVisible();
  await page.getByLabel("Legal name").fill("Jane Dev");
  await page.getByLabel("Registered address").fill("12 MG Road, Bengaluru");
  await page.getByLabel("PAN", { exact: true }).fill("ABCDE1234F");
  await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await page.getByLabel("Default SAC codes").fill("998314");
  await page.getByLabel("Default AD bank").selectOption({ label: "Acme Test Bank (6390001)" });
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);

  // A full reload boots the database again from IndexedDB: onboarding is remembered, "/" goes to the month.
  await page.goto("/");
  await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
}

/** From a finished onboarding to a generated EDF pack: upload the CSV and a PDF, review, match, hand-typed payment, generate. */
export async function generateEdfPack(page: Page, origin: string): Promise<void> {
  // Upload the Deel CSV and an invoice PDF (a real text-layer PDF, read by pdf.js in the browser).
  await page.goto(`/month?m=${MONTH}`);
  await page.getByTestId("file-input").setInputFiles([
    { name: "synthetic-transactions.csv", mimeType: "text/csv", buffer: DEEL_CSV },
    { name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: await makeInvoicePdf() },
  ]);
  const invoice = page.getByRole("article", { name: "Invoice INV-2026-014" });
  await expect(invoice).toBeVisible();

  // Confirm the proposed match.
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Confirmed \(1\)/ })).toBeVisible();

  // Every locally extracted field is "Check this" (confidence 0.6): "I've checked these" confirms them in one click.
  await expect(invoice.getByText("Check this").first()).toBeVisible();
  await invoice.getByRole("button", { name: /I.ve checked these/ }).click();
  await expect(invoice.getByText("Check this")).toHaveCount(0);

  // Editing a value still works.
  await invoice.getByRole("button", { name: "Edit SAC code" }).click();
  await invoice.getByLabel("SAC code", { exact: true }).fill("998314");
  await invoice.getByRole("button", { name: "Save" }).click();
  await expect(invoice.getByRole("button", { name: "Edit SAC code" })).toContainText("998314");

  // The local reader does not find a client address: it is typed in by hand (the pack is blocked until it is there).
  await expect(page.getByText("Invoice INV-2026-014 is missing Client address.")).toBeVisible();
  await invoice.getByRole("button", { name: "Edit Client address" }).click();
  await invoice.getByLabel("Client address", { exact: true }).fill("1 Main Street, New York, NY 10001");
  await invoice.getByRole("button", { name: "Save" }).click();
  await expect(invoice.getByRole("button", { name: "Edit Client address" })).toContainText("1 Main Street");

  // A payment typed in by hand.
  await page.getByRole("button", { name: "Add payment by hand" }).click();
  const payForm = page.getByRole("form", { name: "Add payment by hand" });
  await payForm.getByLabel("Payer").fill("Hand Payer Ltd");
  await payForm.getByLabel("Date").fill("2026-09-15");
  await payForm.getByLabel("Foreign amount", { exact: true }).fill("250.50");
  await payForm.getByRole("button", { name: "Save payment" }).click();
  await expect(payForm).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Payer" }).filter({ hasText: "Hand Payer Ltd" })).toBeVisible();

  // Generate the pack: four files, downloadable as blob: URLs.
  await page.getByRole("button", { name: "Generate EDF pack" }).click();
  await expect(page).toHaveURL(/\/pack\?id=[^&]+$/);
  await expect(page.getByRole("heading", { name: /EDF pack for/ })).toBeVisible();
  const downloads = page.getByRole("link", { name: "Download" });
  await expect(downloads).toHaveCount(4);
  await expect(page.getByText("Korra does not submit anything for you")).toBeVisible(); // the guide's text, read from the local store
  for (const href of await downloads.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) expect(href).toMatch(new RegExp(`^blob:${origin}/`));
}
