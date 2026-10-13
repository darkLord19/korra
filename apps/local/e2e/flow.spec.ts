import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type BrowserContext, type Download, type Page } from "@playwright/test";
import { makeInvoicePdf } from "./invoice-pdf";
import {
  completeSetup, expectPackFiles, expectPrivate, finishReview, flow, LANDING_HEADING, makePackSkipSignature, markSent, MONTH,
  taskUrl, uploadStatementAndContinue, watchPrivacy,
} from "./support";

const PHONE = { width: 390, height: 844 };

function directive(csp: string, name: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
}

/** The Home list's own headline ("2 things need you"): the flow beside or instead of it has titles of its own. */
const listHeadline = (page: Page) => page.getByRole("heading", { level: 1, name: /things? needs? you|all caught up|get you set up/i });
const desktopNav = (page: Page) => page.getByRole("navigation", { name: "Main", exact: true });
const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main tabs", exact: true });

/** What the shell and the Home layout look like at this size, with a flow open (`?task=`). */
async function expectFlowLayout(page: Page, phone: boolean): Promise<void> {
  const box = (await flow(page).boundingBox())!;
  if (phone) {
    await expect(tabBar(page)).toBeVisible();
    await expect(desktopNav(page)).toBeHidden();
    await expect(listHeadline(page)).toBeHidden(); // the flow takes the whole screen; the list is behind it
    expect(box.x, "the flow starts at the left edge, inside a 16px gutter").toBeLessThan(24);
    expect(box.width, "the flow uses the full phone width").toBeGreaterThan(PHONE.width - 48);
  } else {
    await expect(desktopNav(page)).toBeVisible();
    await expect(tabBar(page)).toBeHidden();
    await expect(listHeadline(page)).toBeVisible(); // the list stays beside the flow
    expect(box.x, "the flow sits to the right of the list").toBeGreaterThan(300);
  }
}

/** Switches tab through whichever bar this size shows. */
async function goToTab(page: Page, phone: boolean, name: "Home" | "Months" | "Settings"): Promise<void> {
  await (phone ? tabBar(page) : desktopNav(page)).getByRole("link", { name }).click();
}

async function mainFlow(page: Page, context: BrowserContext, request: APIRequestContext, baseURL: string, phone: boolean): Promise<void> {
  const origin = new URL(baseURL).origin;
  const seen = await watchPrivacy(page, context);
  const f = flow(page);

  /* ---------------- landing, then setup by dropping an invoice ---------------- */
  await completeSetup(page, {
    bankLabel: "State Bank of India",
    onSummary: async (summary) => {
      // The invoice's own details, read on this device, are shown as a summary to confirm (not as a form to type).
      await expect(summary.getByText("29ABCDE1234F1Z5")).toBeVisible();
      await expect(summary.getByText("ABCDE1234F", { exact: true })).toBeVisible();
      await expect(summary.getByText("12 MG Road, Bengaluru 560001, India")).toBeVisible();
      await expect(summary.getByRole("button", { name: "Edit GSTIN" })).toBeVisible();
    },
  });
  await expectFlowLayout(page, phone);

  /* ----------------------------- the statement ----------------------------- */
  await uploadStatementAndContinue(page);
  await expectFlowLayout(page, phone);

  /* -------------- review: one card at a time, each way of answering -------------- */
  await expect(f.getByRole("heading", { name: "A few quick checks" })).toBeVisible();
  const card = f.getByText(/ is missing its | read .* as the /).first();
  await expect(card).toContainText("as the invoice number on this invoice");
  await expect(f.getByRole("button", { name: "Everything on INV-2026-014 looks right" })).toBeVisible();

  await f.getByRole("button", { name: "Skip", exact: true }).click(); // the skipped card goes to the end of the queue
  await expect(card).toContainText("as the invoice date");
  await f.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(card).toContainText("as the client name");
  await f.getByRole("button", { name: "Looks right", exact: true }).click();

  // The one field the local reader cannot find is asked for, not guessed: there is no "Looks right" for it.
  await expect(card).toContainText("INV-2026-014 is missing its client address");
  await expect(f.getByRole("button", { name: "Looks right", exact: true })).toHaveCount(0);
  await f.getByLabel("Client address", { exact: true }).fill("1 Main Street, New York, NY 10001");
  await f.getByRole("button", { name: "Save", exact: true }).click();

  await expect(card).toContainText("as the client country");
  await f.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(card).toContainText("as the invoice amount");
  await f.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(card).toContainText("as the net realisable value");
  await f.getByRole("button", { name: "Looks right", exact: true }).click();

  // "Fix it" opens an editor on the card; saving the new value settles the card.
  await expect(card).toContainText("as the service description");
  await f.getByRole("button", { name: "Fix it" }).click();
  await f.getByLabel("Service description", { exact: true }).fill("Software development services");
  await f.getByRole("button", { name: "Save", exact: true }).click();

  // What is left (the SAC code and the skipped invoice number) is answered at once.
  await expect(card).toContainText("as the SAC code");
  await f.getByRole("button", { name: "Everything on INV-2026-014 looks right" }).click();
  await expect(f.getByText("All checked ✓")).toBeVisible();

  /* ------------- make the pack, skip the in-app signature, send it ------------- */
  await f.getByRole("button", { name: "Make my pack" }).click();
  await expect(page).toHaveURL(/\/home\?task=generate%3A2026-09%3A/);
  await expect(f.getByRole("heading", { name: "Make your pack" })).toBeVisible();
  await expect(f.getByText("1 invoice")).toBeVisible();
  await expect(f.getByText("USD 1,500.00")).toBeVisible();
  await expect(f.getByText("We couldn't find State Bank of India's own EDF form, so this pack uses the RBI format. Ask your branch if it's accepted.")).toBeVisible();
  const packId = await makePackSkipSignature(page);
  await expectFlowLayout(page, phone);

  // The Send step: the files made on this device, one "Download pack" button, and the way to send them.
  await expect(f.getByText("We couldn't find State Bank of India's own EDF form, so this uses the RBI format. Ask your branch if it's accepted.")).toBeVisible();
  const names = await expectPackFiles(page, origin);
  expect(names).toContain("EDF-state-bank-of-india-2026-09.pdf");

  const downloads: Download[] = [];
  page.on("download", (d) => downloads.push(d));
  await f.getByRole("button", { name: "Download pack" }).click();
  await expect.poll(() => downloads.length, { message: "Download pack saves all four files" }).toBe(4);
  expect(downloads.map((d) => d.suggestedFilename()).sort()).toEqual([...names].sort());
  const pdf = downloads.find((d) => d.suggestedFilename() === "EDF-state-bank-of-india-2026-09.pdf")!;
  expect(readFileSync((await pdf.path())!).byteLength).toBeGreaterThan(500);

  // The branch's email is asked for once, then the email is drafted (the "other ways to send" may hold it).
  const emailField = f.getByLabel("Branch or RM email");
  if (!(await emailField.isVisible())) await f.getByText("Other ways to send").click();
  await emailField.fill("rm.trade@sbi.co.in");
  await f.getByRole("button", { name: "Save email" }).click();
  const draft = f.getByRole("link", { name: "Open in email app" });
  await expect(draft).toBeVisible();
  const mailto = (await draft.getAttribute("href"))!;
  expect(mailto).toMatch(/^mailto:rm\.trade@sbi\.co\.in\?/);
  expect(mailto).toContain("EDF%20Submission");
  expect(decodeURIComponent(mailto)).toContain("EDF-state-bank-of-india-2026-09.pdf");

  // Sent: with the bank's acknowledgement, which is stored and not read as an invoice.
  await markSent(page, await makeInvoicePdf(["Acknowledged by the bank"]));
  await expect(f.getByText("Keep a copy of your data")).toBeVisible();
  const waitlist = page.getByRole("link", { name: /Get notified when accounts with sync/ });
  await expect(waitlist).toBeVisible();
  await expect(waitlist).toHaveAttribute("target", "_blank");
  await expect(waitlist).toHaveAttribute("rel", /noopener/);

  /* -------------------------- Home moves on to what is next -------------------------- */
  await f.getByRole("button", { name: "Next up →" }).click();
  await expect(page).toHaveURL(taskUrl("upload:2026-10"));
  await expect(page.getByRole("status").getByText("Nice! Next up: Add your October 2026 invoices")).toBeVisible();
  await expect(f.getByRole("heading", { name: "Add your October invoices" })).toBeVisible();
  await expectFlowLayout(page, phone);

  // Closing the flow shows the list: what is still to do (a backup, now a pack exists), and what is done.
  await f.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(listHeadline(page)).toBeVisible();
  await expect(page.getByRole("link", { name: /Back up your data/ })).toHaveAttribute("href", "/home?task=backup");
  await expect(page.getByText("Sent September 2026 pack")).toBeVisible();

  /* ----------------------- Months: the month, its invoice, its pack ----------------------- */
  await goToTab(page, phone, "Months");
  await expect(page).toHaveURL(/\/months$/);
  const monthCard = page.getByRole("link", { name: /September 2026/ });
  await expect(monthCard).toContainText("Sent ✓");
  await expect(monthCard).toContainText("1 invoice");
  const due = page.getByRole("heading", { name: "Payments due" });
  await expect(due).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "INV-2026-014" })).toContainText("Acme Corp");

  await monthCard.click();
  await expect(page).toHaveURL(new RegExp(`/months\\?m=${MONTH}$`));
  await expect(page.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();
  await page.getByRole("button", { name: /Acme Corp/ }).click();
  const sheet = page.getByRole("dialog", { name: "Invoice INV-2026-014" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edit SAC code" })).toContainText("998314");
  await expect(sheet.getByRole("button", { name: "Edit Service description" })).toContainText("Software development services"); // the fix made in the review
  await expect(sheet.getByRole("button", { name: "Edit Client address" })).toContainText("1 Main Street");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await page.locator("summary").filter({ hasText: /^Documents/ }).click();
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  await page.getByRole("link", { name: /State Bank of India/ }).click();
  await expect(page).toHaveURL(new RegExp(`/pack\\?id=${packId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  // An already sent pack is its summary and files, with nothing left to do.
  await expect(page.getByRole("heading", { name: "EDF pack for September 2026" })).toBeVisible();
  await expect(page.getByText(/^Submitted \d/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Download .+/ })).toHaveCount(4);

  // Settings render; no CA sharing exists in the local app.
  await goToTab(page, phone, "Settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Share with my CA")).toHaveCount(0);
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
  for (const url of [`${origin}/`, `${origin}/home`, `${origin}/months`, chunk, `${origin}/pdfjs/pdf.worker.min.mjs`]) {
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
}

test("client-only flow: landing to a sent EDF pack and the next task, with nothing leaving the device", async ({ page, context, request, baseURL }) => {
  await mainFlow(page, context, request, baseURL!, false);
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE });
  test("the same flow, full screen, with the bottom tab bar", async ({ page, context, request, baseURL }) => {
    await mainFlow(page, context, request, baseURL!, true);
  });
});

test("the old routes still lead somewhere: /month, /tracker and /onboarding", async ({ page, context, baseURL }) => {
  const seen = await watchPrivacy(page, context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: LANDING_HEADING })).toBeVisible();
  for (const [from, to] of [["/onboarding", /\/home$/], ["/tracker", /\/months$/], ["/month?m=2026-09", /\/months\?m=2026-09$/], ["/month", /\/months$/]] as const) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
  }
  expectPrivate(seen, new URL(baseURL!).origin);
});

test("signing in the app stamps the signature onto the EDF", async ({ page, context, baseURL }) => {
  test.setTimeout(300_000);
  const seen = await watchPrivacy(page, context);
  const f = flow(page);
  await completeSetup(page);
  await uploadStatementAndContinue(page);
  await finishReview(page);
  await f.getByRole("button", { name: "Make my pack" }).click();
  await expect(f.getByRole("heading", { name: "Sign your pack" })).toBeVisible();

  // Draw on the canvas, name the signatory, and sign: the pack is made again with the signature on it.
  const canvas = f.locator("canvas");
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect(f.getByRole("button", { name: "Clear" })).toBeEnabled();
  await f.getByLabel("Authorised signatory name").fill("Jane Dev");
  await f.getByLabel("Designation").fill("Director");
  await f.getByRole("button", { name: "Sign my pack" }).click();
  await expect(f.getByRole("heading", { name: "Send your pack" })).toBeVisible();

  const downloads: Download[] = [];
  page.on("download", (d) => downloads.push(d));
  await f.getByRole("button", { name: "Download pack" }).click();
  await expect.poll(() => downloads.length).toBe(4);
  const edf = downloads.find((d) => /^EDF-.*\.pdf$/.test(d.suggestedFilename()))!;
  const bytes = readFileSync((await edf.path())!);
  expect(bytes.byteLength).toBeGreaterThan(500);
  expect(bytes.toString("latin1")).toContain("/XObject"); // the stamped signature image
  expectPrivate(seen, new URL(baseURL!).origin);
});
