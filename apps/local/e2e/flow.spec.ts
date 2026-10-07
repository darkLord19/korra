import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { makeInvoicePdf } from "./invoice-pdf";
import { addPaymentsAndMatches, completeOnboarding, enterTracking, expectPrivate, generateEdfPack, MONTH, watchPrivacy } from "./support";

function directive(csp: string, name: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
}

test("client-only flow: onboarding to EDF pack and tracker, with nothing leaving the device", async ({ page, context, request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const seen = await watchPrivacy(page, context);

  await completeOnboarding(page);

  // In EDF-mode month: Payments, Main nav, and banners are hidden.
  await page.goto(`/month?m=${MONTH}`);
  await expect(page.getByRole("heading", { name: "Payments" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Storage warning" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Backup reminder" })).toHaveCount(0);

  // Generate EDF pack in EDF mode.
  await generateEdfPack(page, origin);

  // On the pack page: nudge card is visible.
  await expect(page.getByRole("heading", { name: /Want Korra to keep watching these invoices/ })).toBeVisible();

  // Waitlist link is present, has target=_blank, and is not clicked.
  const waitlist = page.getByRole("link", { name: /Get notified when accounts with sync/ });
  await expect(waitlist).toBeVisible();
  await expect(waitlist).toHaveAttribute("target", "_blank");
  await expect(waitlist).toHaveAttribute("rel", /noopener/);

  // "Keep tracking in this browser" sets flow to "tracking", opens tracker, and nav appears.
  await enterTracking(page);
  await expect(page).toHaveURL(/\/tracker$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // In full mode, confirm match and add hand payment.
  await addPaymentsAndMatches(page);

  // Download a pack file.
  await page.goto(`/month?m=${MONTH}`);
  await page.getByRole("link", { name: /^Pack generated/ }).first().click();
  const downloads = page.getByRole("link", { name: "Download" });
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
  // ...but this app's own data-safety panels are there.
  await expect(page.getByRole("heading", { name: "Back up and restore" })).toBeVisible();
  await expect(page.getByText(/^Storage: (protected|not protected)$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete all local data" })).toBeVisible();

  /* ---------------------- whole-flow privacy assertions ---------------------- */

  // Positive controls: the traffic that matters really was observed (PGlite's wasm/data and the pdf.js worker).
  const urls = seen.requests.map((r) => r.url);
  expect(urls.some((u) => /\.wasm(\?|$)/.test(u)), "PGlite wasm was requested").toBe(true);
  expect(urls.some((u) => /\.data(\?|$)/.test(u)), "PGlite data was requested").toBe(true);
  expect(urls.some((u) => u.endsWith("/pdfjs/pdf.worker.min.mjs")), "pdf.js worker was requested").toBe(true);

  // Nothing leaves the origin, nothing but GET is sent, no CSP violations, no console errors.
  expectPrivate(seen, origin);

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
