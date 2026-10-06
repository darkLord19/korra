import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Request } from "@playwright/test";
import { makeInvoicePdf } from "./invoice-pdf";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
const MONTH = "2026-09";

/** The one harmless message PGlite's initdb prints on a cold boot (docs/research/2026-10-06-v0-browser-spike.md). */
const TOLERATED = /ErrnoError/;

function directive(csp: string, name: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
}

test("client-only flow: onboarding to EDF pack and tracker, with nothing leaving the device", async ({ page, context, request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: { url: string; method: string }[] = [];
  const problems: string[] = [];
  const cspViolations: string[] = [];

  context.on("request", (r: Request) => requests.push({ url: r.url(), method: r.method() }));
  const watchMessages = (p: Page) => {
    p.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !TOLERATED.test(m.text())) problems.push(`console.${m.type()}: ${m.text()} (${m.location().url})`);
    });
    p.on("pageerror", (e) => { if (!TOLERATED.test(String(e)) && !TOLERATED.test(e.name)) problems.push(`pageerror: ${e.message}`); });
    p.on("worker", (w) => {
      w.on("console", (m) => {
        if ((m.type() === "error" || m.type() === "warning") && !TOLERATED.test(m.text())) problems.push(`worker console.${m.type()}: ${m.text()}`);
      });
    });
  };
  context.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  watchMessages(page);
  await context.exposeBinding("__cspViolation", (_src, v: string) => { cspViolations.push(v); });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      void (window as unknown as { __cspViolation(v: string): Promise<void> }).__cspViolation(`${e.violatedDirective} blocked ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`);
    });
  });

  // First run: "/" leads to onboarding.
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
  const [download] = await Promise.all([page.waitForEvent("download"), downloads.first().click()]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.byteLength).toBeGreaterThan(500);

  // Record the submission with an acknowledgement (stored, not read as an invoice).
  await page.getByTestId("file-input").setInputFiles({ name: "bank-ack.pdf", mimeType: "application/pdf", buffer: await makeInvoicePdf(["Acknowledged by the bank"]) });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark as submitted" }).click();
  await expect(page.getByText(/^Submitted \d/)).toBeVisible();
  await page.goto(`/month?m=${MONTH}`);
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);

  // The invoice is realised in the tracker.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tracker" }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  const row = page.getByRole("row", { name: /INV-2026-014/ });
  await expect(row).toContainText("Realised");
  await expect(row).toContainText("Acme Corp");

  // Settings render; no CA sharing exists in the local app.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Share with my CA")).toHaveCount(0);

  /* ---------------------- whole-flow privacy assertions ---------------------- */

  // Positive controls: the traffic that matters really was observed (PGlite's wasm/data and the pdf.js worker).
  const urls = requests.map((r) => r.url);
  expect(urls.some((u) => /\.wasm(\?|$)/.test(u)), "PGlite wasm was requested").toBe(true);
  expect(urls.some((u) => /\.data(\?|$)/.test(u)), "PGlite data was requested").toBe(true);
  expect(urls.some((u) => u.endsWith("/pdfjs/pdf.worker.min.mjs")), "pdf.js worker was requested").toBe(true);

  // Nothing leaves the origin (blob: URLs minted by this origin are local), and nothing but GET is ever sent.
  const offOrigin = requests.filter((r) => !(r.url.startsWith(`${origin}/`) || r.url.startsWith(`blob:${origin}/`) || r.url.startsWith("data:")));
  expect(offOrigin, "requests that left the origin").toEqual([]);
  expect(requests.filter((r) => r.method !== "GET"), "non-GET requests").toEqual([]);

  expect(cspViolations, "CSP violations").toEqual([]);
  expect(problems, "console errors and warnings").toEqual([]);

  // The strict policy is what is served: on a page, a script chunk and the pdf.js worker (workers take their CSP from their script response).
  const chunk = urls.find((u) => /\/_next\/static\/chunks\/.*\.js/.test(u))!;
  for (const url of [`${origin}/`, `${origin}/month`, chunk, `${origin}/pdfjs/pdf.worker.min.mjs`]) {
    const csp = (await request.get(url)).headers()["content-security-policy"] ?? "";
    expect(csp, url).toContain("default-src 'self'");
    expect(csp, url).toContain("connect-src 'self'");
    expect(csp, url).toContain("worker-src 'self' blob:");
    const scripts = directive(csp, "script-src");
    expect(scripts, url).toContain("'wasm-unsafe-eval'");
    expect(scripts, url).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
    expect(scripts, url).not.toContain("'unsafe-inline'");
    expect(scripts, url).not.toContain("'unsafe-eval'");
    expect(csp, url).not.toMatch(/https?:\/\//);
  }
});
