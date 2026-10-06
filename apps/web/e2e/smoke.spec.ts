import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type APIRequestContext } from "@playwright/test";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
// The dev fake extractor reads a file named demo-invoice.pdf as INV-2026-014 (USD 1,500, dated 2026-09-02).
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const MONTH = "2026-09";

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

test("sign up to EDF pack, tracker and CA invite", async ({ page, request }) => {
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

  // Onboarding: one bank, then the profile.
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
  await expect(page).toHaveURL(/\/months\/\d{4}-\d{2}$/);

  // Upload the Deel CSV and the demo invoice for September 2026.
  await page.goto(`/months/${MONTH}`);
  await page.getByTestId("file-input").setInputFiles([
    { name: "synthetic-transactions.csv", mimeType: "text/csv", buffer: DEEL_CSV },
    { name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
  ]);
  await expect(page.getByRole("article", { name: "Invoice INV-2026-014" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /To review \(\d+\)/ })).toContainText("(1)");

  // Confirm the proposed match.
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Confirmed \(1\)/ })).toBeVisible();

  // The SAC code was read at 60% confidence: "I've checked these" confirms every field in one click.
  const invoice = page.getByRole("article", { name: "Invoice INV-2026-014" });
  await expect(invoice.getByText("Check this")).toBeVisible();
  await invoice.getByRole("button", { name: /I.ve checked these/ }).click();
  await expect(invoice.getByText("Check this")).toHaveCount(0);
  await expect(invoice.getByRole("button", { name: /I.ve checked these/ })).toHaveCount(0);

  // Editing a value still works.
  await invoice.getByRole("button", { name: "Edit SAC code" }).click();
  await invoice.getByLabel("SAC code", { exact: true }).fill("998314");
  await invoice.getByRole("button", { name: "Save" }).click();
  await expect(invoice.getByRole("button", { name: "Edit SAC code" })).toContainText("998314");

  // A payment typed in by hand.
  await page.getByRole("button", { name: "Add payment by hand" }).click();
  const payForm = page.getByRole("form", { name: "Add payment by hand" });
  await payForm.getByLabel("Payer").fill("Hand Payer Ltd");
  await payForm.getByLabel("Date").fill("2026-09-15");
  await payForm.getByLabel("Foreign amount", { exact: true }).fill("250.50");
  await payForm.getByRole("button", { name: "Save payment" }).click();
  await expect(payForm).toHaveCount(0);
  // Cell buttons carry aria-labels ("Edit Payer"), so the row's name omits the value: match the button text.
  await expect(page.getByRole("button", { name: "Edit Payer" }).filter({ hasText: "Hand Payer Ltd" })).toBeVisible();

  // Generate the pack: four files.
  await page.getByRole("button", { name: "Generate EDF pack" }).click();
  await expect(page).toHaveURL(/\/packs\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /EDF pack for/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(4);
  await expect(page.getByText("Korra does not submit anything for you")).toBeVisible();

  // Record the submission with an acknowledgement. It is stored, not read as an invoice
  // (the file is deliberately named like the demo invoice: if it were ingested it would add a second invoice).
  await page.getByTestId("file-input").setInputFiles({ name: "demo-invoice.pdf", mimeType: "application/pdf", buffer: PDF_BYTES });
  await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark as submitted" }).click();
  await expect(page.getByText(/^Submitted \d/)).toBeVisible();
  await page.goto(`/months/${MONTH}`);
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);

  // The invoice is realised in the tracker.
  await page.goto("/tracker");
  const row = page.getByRole("row", { name: /INV-2026-014/ });
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
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Clients" })).toBeVisible();
  await page.getByRole("link", { name: "Open Jane Dev's records" }).click();
  await expect(page.getByText(/Viewing Jane Dev.s records \(read-only\)/)).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname.replace(/\/months\/.*/, "")}/months/${MONTH}`);
  await expect(page.getByRole("article", { name: "Invoice INV-2026-014" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit SAC code" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate EDF pack" })).toHaveCount(0);
  await page.getByRole("link", { name: /Pack generated/ }).click();
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Mark as submitted" })).toHaveCount(0);
});
