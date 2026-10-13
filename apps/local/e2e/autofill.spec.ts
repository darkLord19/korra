import { expect, test } from "@playwright/test";
import { INVOICE_LINES, makeInvoicePdf } from "./invoice-pdf";
import { expectPrivate, flow, MONTH, openMonth, taskUrl, watchPrivacy } from "./support";

test("setup: an invoice fills the empty fields on this device, and is filed as that month's invoice once saved", async ({ page, context, baseURL }) => {
  const seen = await watchPrivacy(page, context);
  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("link", { name: "Let's go" }).click();
  const f = flow(page);
  await expect(f.getByRole("heading", { name: "Drop an invoice" })).toBeVisible();

  // A value typed first is left alone; the rest comes from the invoice (read by pdf.js in the browser).
  await f.getByRole("button", { name: "No invoice handy? Fill it in yourself" }).click();
  await expect(f.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await f.getByLabel("Legal name").fill("Jane Dev (typed)");
  await f.getByRole("button", { name: "Back" }).click();
  const pdf = await makeInvoicePdf([...INVOICE_LINES, "Bank Name: HDFC Bank Ltd.", "IFSC Code: HDFC0001234"]);
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: "jane-invoice.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(f.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await expect(f.getByText("Jane Dev (typed)")).toBeVisible();
  await expect(f.getByText("12 MG Road, Bengaluru 560001, India")).toBeVisible();
  await expect(f.getByText("29ABCDE1234F1Z5")).toBeVisible();
  await expect(f.getByText("ABCDE1234F", { exact: true })).toBeVisible();
  // The invoice named the bank, so there is no bank step: it is shown here, with a way to change it.
  await expect(f.getByText("HDFC Bank", { exact: true })).toBeVisible();
  await expect(f.getByRole("button", { name: "Change" })).toBeVisible();

  // Nothing was saved by reading it: saving is the person's own step, and the invoice rides along to its month.
  await f.getByRole("button", { name: "Looks right, save" }).click();
  await expect(page).toHaveURL(taskUrl(`upload:${MONTH}`));
  await expect(f.getByRole("button", { name: "Continue" })).toBeEnabled(); // the invoice has been read
  await openMonth(page, /^Documents/);
  await expect(page.getByRole("button", { name: /Acme Corp/ })).toBeVisible(); // the invoice, read and filed
  await expect(page.getByText("jane-invoice.pdf")).toHaveCount(1); // filed once, not twice
  await expect(page.getByRole("button", { name: /Acme Corp/ })).toHaveCount(1);

  // What was saved: the typed name and the invoice's bank.
  await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Legal name")).toHaveValue("Jane Dev (typed)");
  await expect(page.getByLabel("Which bank receives your foreign payments?")).toHaveValue("hdfc");

  expectPrivate(seen, new URL(baseURL!).origin);
});

test("setup: a scan or a file with nothing readable says so, and leaves the form alone", async ({ page, context, baseURL }) => {
  const seen = await watchPrivacy(page, context);
  await page.goto("/home?task=setup");
  const f = flow(page);
  await expect(f.getByRole("heading", { name: "Drop an invoice" })).toBeVisible();
  await page.getByTestId("invoice-fill-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: await makeInvoicePdf([]) });
  await expect(f.getByText("Couldn't read details from this file; fill them in by hand.")).toBeVisible();
  await expect(f.getByRole("heading", { name: "Drop an invoice" })).toBeVisible(); // still here: nothing was filled in

  await f.getByRole("button", { name: "No invoice handy? Fill it in yourself" }).click();
  await expect(f.getByLabel("Legal name")).toHaveValue("");
  await expect(f.getByLabel("GSTIN")).toHaveValue("");
  await expect(f.getByRole("button", { name: "Looks right" })).toBeDisabled(); // nothing to confirm until the details are typed
  expectPrivate(seen, new URL(baseURL!).origin);
});
