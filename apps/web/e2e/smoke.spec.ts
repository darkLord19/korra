import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
// The dev fake extractor reads a file named demo-invoice.pdf as INV-2026-014 (USD 1,500, dated 2026-09-02).
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const MONTH = "2026-09";

/** The guided flow's pane: Home's list can sit beside it, repeating titles, so a flow's buttons are found inside this. */
const flow = (page: Page) => page.locator('section[aria-labelledby="flow-title"]');

type Mail = { to: string; subject: string; text: string };

async function lastMailTo(request: APIRequestContext, to: string, subject: RegExp): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(async () => {
      const mails = (await (await request.get("/api/dev-mail?n=50")).json()) as Mail[];
      found = mails.filter((m) => m.to === to && subject.test(m.subject)).at(-1);
      return found !== undefined;
    })
    .toBe(true);
  return found!;
}

test("sign up to a sent EDF pack, Payments due and CA invite", async ({ page, request }) => {
  const email = `jane+${Date.now()}@example.test`;

  // Cron routes refuse requests without the secret (none is configured here).
  expect((await request.get("/api/cron/sweep")).status()).toBe(401);
  expect((await request.get("/api/cron/notify", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);

  // Sign up and verify through the link the dev mailer recorded.
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Jane Dev");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const verify = await lastMailTo(request, email, /verify/i);
  const link = /https?:\/\/\S+/.exec(verify.text)![0];
  await page.goto(link);

  // Setup is the first task on Home: "Let's get you set up" -> the setup flow. (/onboarding leads here too.)
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Let's get you set up" })).toBeVisible();
  await page.getByRole("link", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home\?task=setup$/);
  const setup = flow(page);
  await expect(setup.getByRole("heading", { name: "Drop an invoice" })).toBeVisible();

  // The dev fake reader finds no details of the exporter in the demo invoice: it says so and leaves the form alone.
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: PDF_BYTES });
  await expect(setup.getByText("Couldn't read details from this file; fill them in by hand.")).toBeVisible();
  await setup.getByRole("button", { name: "No invoice handy? Fill it in yourself" }).click();
  await expect(setup.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await setup.getByLabel("Legal name").fill("Jane Dev");
  await setup.getByLabel("Registered address").fill("12 MG Road, Bengaluru");
  await setup.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await expect(setup.getByLabel("PAN", { exact: true })).toHaveValue("ABCDE1234F"); // filled in from the GSTIN
  await setup.getByRole("button", { name: "Looks right" }).click();
  await setup.getByRole("radio", { name: "Kotak Mahindra Bank" }).click();
  await setup.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/home\?task=upload%3A\d{4}-\d{2}$/); // no invoice was dropped: the current month

  // Upload the Deel CSV and the demo invoice for September 2026 (the upload task of that month).
  await page.goto(`/home?task=${encodeURIComponent(`upload:${MONTH}`)}`);
  const upload = flow(page);
  await expect(upload.getByRole("heading", { name: "Add your September invoices" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles([
    { name: "synthetic-transactions.csv", mimeType: "text/csv", buffer: DEEL_CSV },
    { name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
  ]);
  await expect(upload.getByText("Read ✓")).toHaveCount(2);

  // Months: the invoice is a card; the proposed match and a payment typed by hand are under "Payments & matches".
  await page.goto(`/months/${MONTH}`);
  await expect(page.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Acme Corp/ })).toHaveCount(1);
  await page.locator("summary").filter({ hasText: "Payments & matches" }).click();
  await expect(page.getByRole("heading", { name: /To review \(\d+\)/ })).toContainText("(1)");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Confirmed \(1\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Add payment by hand" }).click();
  const payForm = page.getByRole("form", { name: "Add payment by hand" });
  await payForm.getByLabel("Payer").fill("Hand Payer Ltd");
  await payForm.getByLabel("Date").fill("2026-09-15");
  await payForm.getByLabel("Foreign amount", { exact: true }).fill("250.50");
  await payForm.getByRole("button", { name: "Save payment" }).click();
  await expect(payForm).toHaveCount(0);
  // Cell buttons carry aria-labels ("Edit Payer"), so the row's name omits the value: match the button text.
  await expect(page.getByRole("button", { name: "Edit Payer" }).filter({ hasText: "Hand Payer Ltd" })).toBeVisible();

  // Review: the SAC code was read at 60% confidence and is the one thing to check. "Fix it" edits it.
  await page.getByRole("link", { name: /Check 1 thing/ }).click();
  await expect(page).toHaveURL(/\/home\?task=review%3A2026-09$/);
  const review = flow(page);
  await expect(review.getByText(/as the SAC code on INV-2026-014/)).toBeVisible();
  await review.getByRole("button", { name: "Fix it" }).click();
  await review.getByLabel("SAC code", { exact: true }).fill("998314");
  await review.getByRole("button", { name: "Save", exact: true }).click();
  await expect(review.getByText("All checked ✓")).toBeVisible();

  // Make the pack, choose the paper signature, and the four files are there.
  await review.getByRole("button", { name: "Make my pack" }).click();
  await expect(page).toHaveURL(/\/home\?task=generate%3A2026-09%3A/);
  await review.getByRole("button", { name: "Make my pack" }).click();
  await expect(review.getByRole("heading", { name: "Sign your pack" })).toBeVisible();
  await review.getByRole("button", { name: "My bank needs a wet signature" }).click();
  await expect(review.getByRole("heading", { name: "Send your pack" })).toBeVisible();
  await review.getByText("What's inside").click();
  await expect(review.getByRole("link", { name: /^Download .+/ })).toHaveCount(4);
  await expect(review.getByRole("button", { name: "Download pack" })).toBeVisible();

  // Mark it sent with an acknowledgement. It is stored, not read as an invoice
  // (the file is deliberately named like the demo invoice: if it were ingested it would add a second invoice).
  await review.getByRole("button", { name: "I've sent it →" }).click();
  await expect(review.getByRole("heading", { name: "Mark it as sent" })).toBeVisible();
  await review.getByTestId("file-input").setInputFiles({ name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: PDF_BYTES });
  await expect(review.getByText("Uploaded", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Mark as sent" }).click();
  await expect(review.getByText("Sent!")).toBeVisible();
  await page.goto(`/months/${MONTH}`);
  await page.locator("summary").filter({ hasText: /^Documents/ }).click();
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  await expect(page.getByRole("button", { name: /Acme Corp/ })).toHaveCount(1);

  // The invoice is realised under "Payments due" on the Months page (/tracker leads there too).
  await page.goto("/tracker");
  await expect(page).toHaveURL(/\/months$/);
  await expect(page.getByRole("heading", { name: "Payments due" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "INV-2026-014" });
  await expect(row).toContainText("Realised");
  await expect(row).toContainText("Acme Corp");

  // Settings: invite a CA.
  await page.goto("/settings");
  await page.getByLabel("Your CA's email").fill("ca@firm.test");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent.")).toBeVisible();
  await expect(page.getByRole("list", { name: "People you have shared with" })).toContainText("ca@firm.test");
  const invite = await lastMailTo(request, "ca@firm.test", /invited you/i);
  expect(invite.text).toContain("/ca/accept?token=");

  // The CA signs up, accepts the invitation and sees the client read-only.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Create a free account" })).toBeVisible();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Chandra CA");
  await page.getByLabel("Email").fill("ca@firm.test");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  const caVerify = await lastMailTo(request, "ca@firm.test", /verify/i);
  await page.goto(/https?:\/\/\S+/.exec(caVerify.text)![0]);
  await page.goto(/https?:\/\/\S+\/ca\/accept\?token=\S+/.exec(invite.text)![0]);
  await expect(page.getByRole("heading", { name: "Jane Dev invited you" })).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page).toHaveURL(/\/ca$/);
  await expect(page.getByRole("link", { name: "Clients" })).toBeVisible();
  await page.getByRole("link", { name: "Open Jane Dev's records" }).click();
  await expect(page.getByText(/Viewing Jane Dev.s records \(read-only\)/)).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname.replace(/\/months\/.*/, "")}/months/${MONTH}`);
  await expect(page.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();

  // Read-only: the invoice opens, its fields cannot be edited, and nothing can be added or made.
  await page.getByRole("button", { name: /Acme Corp/ }).click();
  const sheet = page.getByRole("dialog", { name: "Invoice INV-2026-014" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("998314")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edit SAC code" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Add documents" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add an invoice by hand" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Make my pack|Send your pack/ })).toHaveCount(0);

  // The pack is its summary and four files; "Payments due" is there too.
  await page.getByRole("link", { name: /Kotak Mahindra Bank/ }).click();
  await expect(page.getByRole("heading", { name: "EDF pack for September 2026" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Download .+/ })).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Mark as sent|I've sent it/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Payments due" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Payments due" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "INV-2026-014" })).toContainText("Realised");
});
