import { expect, test } from "@playwright/test";
import { INVOICE_LINES, makeInvoicePdf } from "./invoice-pdf";
import { expectPrivate, watchPrivacy } from "./support";

test("onboarding: an invoice fills the empty fields on this device, and is filed as that month's invoice once saved", async ({ page, context, baseURL }) => {
  const seen = await watchPrivacy(page, context);
  await page.goto("/");
  await page.getByRole("link", { name: "Prepare my EDF" }).click();
  await expect(page.getByText("Have an invoice handy? Drop it here to fill this in")).toBeVisible();

  // A value typed first is left alone; the rest comes from the invoice (read by pdf.js in the browser).
  await page.getByLabel("Legal name").fill("Jane Dev (typed)");
  const pdf = await makeInvoicePdf([...INVOICE_LINES, "Bank Name: HDFC Bank Ltd.", "IFSC Code: HDFC0001234"]);
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: "jane-invoice.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText("Filled from jane-invoice.pdf: address, GSTIN, PAN, bank. Check them before saving.")).toBeVisible();
  await expect(page.getByLabel("Legal name")).toHaveValue("Jane Dev (typed)");
  await expect(page.getByLabel("Registered address")).toHaveValue("12 MG Road, Bengaluru 560001, India");
  await expect(page.getByLabel("GSTIN")).toHaveValue("29ABCDE1234F1Z5");
  await expect(page.getByLabel("PAN", { exact: true })).toHaveValue("ABCDE1234F");
  await expect(page.getByLabel("Which bank receives your foreign payments?")).toHaveValue("hdfc");

  // Nothing was saved by reading it: saving is the person's own step, and the invoice rides along to its month.
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/month\?m=2026-09$/);
  const invoice = page.getByRole("article", { name: "Invoice INV-2026-014" });
  await expect(invoice).toBeVisible();
  await expect(page.getByText("jane-invoice.pdf")).toHaveCount(1); // filed once, not twice
  await expect(page.getByRole("article")).toHaveCount(1);

  expectPrivate(seen, new URL(baseURL!).origin);
});

test("onboarding: a scan or a file with nothing readable says so, and leaves the form alone", async ({ page, context, baseURL }) => {
  const seen = await watchPrivacy(page, context);
  await page.goto("/onboarding");
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await makeInvoicePdf([]) });
  await expect(page.getByText("Couldn't read details from this file; fill them in by hand.")).toBeVisible();
  await expect(page.getByLabel("Legal name")).toHaveValue("");
  await expect(page.getByLabel("GSTIN")).toHaveValue("");
  expectPrivate(seen, new URL(baseURL!).origin);
});
