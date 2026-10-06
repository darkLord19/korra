import { expect, test } from "@playwright/test";

test("a database that cannot open shows a clear error, not a blank page", async ({ page }) => {
  // No Worker support (or storage blocked): the boot fails and the app says so.
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", { value: undefined, configurable: true });
  });
  await page.goto("/tracker");
  await expect(page.getByRole("alert").filter({ hasText: "could not open its local database" })).toBeVisible();
  await expect(page.getByText("Your data stays in this browser and nothing was sent anywhere.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // The shell is still there, with the disclaimer.
  await expect(page.getByText("Not legal or tax advice.")).toBeVisible();
});
