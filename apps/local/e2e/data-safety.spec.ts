import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readBackup, tamper } from "./backup-file";
import { makeInvoicePdf } from "./invoice-pdf";
import { completeOnboarding, expectPrivate, generateEdfPack, MONTH, watchPrivacy } from "./support";

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const backupPanel = (page: Page) => page.getByRole("region", { name: "Back up and restore" });
const dataPanel = (page: Page) => page.getByRole("region", { name: "Your data" });
const reminder = (page: Page) => page.getByRole("region", { name: "Backup reminder" });
const storageWarning = (page: Page) => page.getByRole("region", { name: "Storage warning" });

/** Gives a "nothing appears" assertion a moment to be wrong: the reminder is decided right after the screen loads. */
const settle = (page: Page) => page.waitForTimeout(500);

/** Make the browser's answer to persist()/persisted() deterministic (Chromium may grant or deny on its own). */
async function stubPersist(page: Page, answer: boolean): Promise<void> {
  await page.addInitScript((persisted) => {
    Object.defineProperty(StorageManager.prototype, "persisted", { value: async () => persisted, configurable: true });
    Object.defineProperty(StorageManager.prototype, "persist", { value: async () => persisted, configurable: true });
  }, answer);
}

/** Settings > Back up now; returns the downloaded file's path. */
async function backUpFromSettings(page: Page, saveTo: string): Promise<string> {
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), backupPanel(page).getByRole("button", { name: "Back up now" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^korra-backup-\d{4}-\d{2}-\d{2}\.korra$/);
  await download.saveAs(saveTo);
  await expect(backupPanel(page).getByText(/^Saved korra-backup-/)).toBeVisible();
  return saveTo;
}

/** The text of the page's content, minus the banners (which come and go) and with whitespace collapsed. */
async function content(main: Locator): Promise<string> {
  return main.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('section[aria-label="Notice"], section[aria-label="Storage warning"], section[aria-label="Backup reminder"], section[aria-label="Backup error"]').forEach((n) => n.remove());
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

interface Snapshot {
  month: string;
  tracker: string;
  pack: string;
  files: { name: string; sha256: string }[];
}

/** What the person sees: the month, the tracker, the pack page and every downloadable pack file (by content hash). */
async function snapshot(page: Page, packUrl: string): Promise<Snapshot> {
  const main = page.locator("main");
  await page.goto(`/month?m=${MONTH}`);
  await expect(page.getByRole("article", { name: "Invoice INV-2026-014" })).toBeVisible();
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  const month = await content(main);

  await page.goto("/tracker");
  await expect(page.getByRole("row", { name: /INV-2026-014/ })).toContainText("Realised");
  const tracker = await content(main);

  await page.goto(packUrl);
  const downloads = page.getByRole("link", { name: "Download" });
  await expect(downloads).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "How to submit your EDF to Acme Test Bank" })).toBeVisible(); // the guide, read from the local store
  const pack = await content(main);
  const files: Snapshot["files"] = [];
  for (let i = 0; i < 4; i++) {
    const [d] = await Promise.all([page.waitForEvent("download"), downloads.nth(i).click()]);
    files.push({ name: d.suggestedFilename(), sha256: createHash("sha256").update(readFileSync((await d.path())!)).digest("hex") });
  }
  return { month, tracker, pack, files };
}

test.describe("backup, restore and delete", () => {
  test("round trip: flow, back up, delete everything, restore, and the state is identical", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(420_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);

    await completeOnboarding(page);
    await generateEdfPack(page, origin);
    const packUrl = new URL(page.url()).pathname + new URL(page.url()).search;

    // A pack was just generated: the reminder appears, once.
    await expect(reminder(page)).toBeVisible();
    await expect(reminder(page).getByText("Your pack is ready.")).toBeVisible();
    await reminder(page).getByRole("button", { name: "Later" }).click();
    await expect(reminder(page)).toHaveCount(0);

    // Record the submission with an acknowledgement, like the main flow does.
    await page.getByTestId("file-input").setInputFiles({ name: "bank-ack.pdf", mimeType: "application/pdf", buffer: await makeInvoicePdf(["Acknowledged by the bank"]) });
    await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mark as submitted" }).click();
    await expect(page.getByText(/^Submitted \d/)).toBeVisible();

    const before = await snapshot(page, packUrl);
    expect(before.files.map((f) => f.name)).toHaveLength(4);

    // Back up now: a .korra file, and the settings remember when.
    await page.goto("/settings");
    await expect(backupPanel(page).getByText("Last backup: never")).toBeVisible();
    const fileA = await backUpFromSettings(page, testInfo.outputPath("backup-a.korra"));
    await expect(backupPanel(page).getByText(/^Last backup: \d+ \w+ \d{4} \(today\)$/)).toBeVisible();
    const a = await readBackup(fileA);
    // The CSV, the invoice PDF, the acknowledgement and the four pack files.
    expect(Object.keys(a.blobs), "the backup holds every uploaded file and pack file").toHaveLength(7);

    // Delete all local data: needs the typed word, then the app is back at first run with nothing left.
    await dataPanel(page).getByRole("button", { name: "Delete all local data" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete all local data?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete everything" })).toBeDisabled();
    await dialog.getByLabel("Type DELETE to confirm").fill("delete");
    await expect(dialog.getByRole("button", { name: "Delete everything" })).toBeDisabled();
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("korra.lastBackupAt"))).toBeNull();
    await expect(page.getByLabel("Legal name")).toHaveValue("");
    await page.goto("/tracker");
    await expect(page.getByRole("row", { name: /INV-2026-014/ })).toHaveCount(0);
    await page.goto("/settings");
    await expect(backupPanel(page).getByText("Last backup: never")).toBeVisible();

    // Restore the file: choosing it asks first, and nothing changes until the person agrees.
    await backupPanel(page).getByLabel("Restore from a backup file").setInputFiles(fileA);
    const confirm = page.getByRole("alertdialog", { name: "Replace all your data with this backup?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("replaces everything");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await page.goto("/tracker");
    await expect(page.getByRole("row", { name: /INV-2026-014/ })).toHaveCount(0); // still empty after Cancel
    await page.goto("/settings");
    await backupPanel(page).getByLabel("Restore from a backup file").setInputFiles(fileA);
    await page.getByRole("alertdialog", { name: "Replace all your data with this backup?" }).getByRole("button", { name: "Replace my data" }).click();
    await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
    await expect(page.getByText("Your backup was restored.")).toBeVisible();

    // Everything the person saw before is back, byte for byte where there are bytes.
    const after = await snapshot(page, packUrl);
    expect(after.month).toBe(before.month);
    expect(after.tracker).toBe(before.tracker);
    expect(after.pack).toBe(before.pack);
    expect(after.files).toEqual(before.files);

    // And the raw state: back up the restored data and compare every table and every stored file with the first backup.
    const fileB = await backUpFromSettings(page, testInfo.outputPath("backup-b.korra"));
    const b = await readBackup(fileB);
    expect(b.manifest.schemaMigrations).toEqual(a.manifest.schemaMigrations);
    expect(Object.keys(b.tables)).toEqual(Object.keys(a.tables));
    for (const t of Object.keys(a.tables)) expect(b.tables[t], `table ${t}`).toEqual(a.tables[t]);
    // (the comparison is not vacuous: the first backup really holds the work)
    for (const t of ["user", "exporter_profile", "ad_bank", "document", "invoice", "payment", "allocation", "pack", "field_edit"]) expect(a.tables[t]?.length, `rows in ${t}`).toBeGreaterThan(0);
    expect(b.blobs).toEqual(a.blobs);
    expect(b.mimes).toEqual(a.mimes);

    expectPrivate(seen, origin);
  });

  test("a bad file is refused with a clear message and the existing data is untouched", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await completeOnboarding(page);
    const good = await backUpFromSettings(page, testInfo.outputPath("good.korra"));

    const bad: Record<string, { file: Buffer | string; message: RegExp }> = {
      "notes.korra": { file: Buffer.from("this is just a text file"), message: /not a Korra backup/ },
      "empty.korra": { file: Buffer.alloc(0), message: /not a Korra backup/ },
      "newer.korra": {
        file: await tamper(good, async (zip) => {
          const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as Record<string, unknown>;
          zip.file("manifest.json", JSON.stringify({ ...manifest, version: 99 }));
        }),
        message: /newer version of Korra/,
      },
      "no-manifest.korra": { file: await tamper(good, (zip) => { zip.remove("manifest.json"); }), message: /no manifest/ },
      // A well-formed backup whose database is not: the old data must survive this.
      "broken-db.korra": { file: await tamper(good, (zip) => { zip.file("db.tar.gz", gzipSync(Buffer.from("not a tar archive"))); }), message: /damaged/ },
      "truncated-db.korra": {
        file: await tamper(good, async (zip) => {
          const dump = await zip.file("db.tar.gz")!.async("uint8array");
          zip.file("db.tar.gz", dump.subarray(0, Math.floor(dump.length / 2)));
        }),
        message: /damaged/,
      },
    };

    await page.goto("/settings");
    const panel = backupPanel(page);
    for (const [name, { file, message }] of Object.entries(bad)) {
      await panel.getByLabel("Restore from a backup file").setInputFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(file) });
      await expect(panel.getByRole("alert").filter({ hasText: message }), name).toBeVisible();
      await expect(page.getByRole("alertdialog"), name).toHaveCount(0);
    }

    // Nothing was touched: not even after a full reload, and the app keeps working.
    await page.goto("/");
    await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
    await page.goto("/settings");
    await expect(page.getByLabel("Legal name")).toHaveValue("Jane Dev");
    await expect(page.getByText("AD code 6390001")).toBeVisible();
    expectPrivate(seen, origin);
  });

  test("restore and delete refuse to start while another Korra tab is open", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await completeOnboarding(page);
    const good = await backUpFromSettings(page, testInfo.outputPath("good.korra"));

    const other = await context.newPage();
    await other.goto("/settings");
    await expect(other.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.goto("/settings");
    await backupPanel(page).getByLabel("Restore from a backup file").setInputFiles(good);
    await page.getByRole("alertdialog", { name: "Replace all your data with this backup?" }).getByRole("button", { name: "Replace my data" }).click();
    await expect(backupPanel(page).getByRole("alert")).toContainText("Korra is open in another tab");

    await dataPanel(page).getByRole("button", { name: "Delete all local data" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete all local data?" });
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await dialog.getByRole("button", { name: "Delete everything" }).click();
    await expect(dataPanel(page).getByRole("alert")).toContainText("Korra is open in another tab");

    // Both tabs still have their data; the page was not left in a "working" state.
    await expect(page.getByLabel("Legal name")).toHaveValue("Jane Dev");
    await other.close();
    await page.reload();
    await expect(page.getByLabel("Legal name")).toHaveValue("Jane Dev");
    expectPrivate(seen, origin);
  });
});

test.describe("persistent storage", () => {
  test("Settings and the warning follow whatever this browser answers", async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await page.goto("/settings");
    await expect(backupPanel(page).getByText(/^Storage: (protected|not protected)$/)).toBeVisible();
    const persisted = await page.evaluate(() => navigator.storage.persisted());
    await expect(backupPanel(page).getByText(`Storage: ${persisted ? "protected" : "not protected"}`)).toBeVisible();
    await expect(storageWarning(page)).toHaveCount(persisted ? 0 : 1);
    expectPrivate(seen, origin);
  });

  test("granted: shown as protected, no warning", async ({ page }) => {
    await stubPersist(page, true);
    await page.goto("/settings");
    await expect(backupPanel(page).getByText("Storage: protected")).toBeVisible();
    await expect(storageWarning(page)).toHaveCount(0);
  });

  test("denied: a warning on every page that cannot be dismissed, linking to Settings", async ({ page }) => {
    await stubPersist(page, false);
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
    const warning = storageWarning(page);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Back up regularly");
    await expect(warning.getByRole("button")).toHaveCount(0);
    await expect(warning).not.toContainText("Home Screen"); // Chrome: not a Safari problem
    await page.reload();
    await expect(storageWarning(page)).toBeVisible();

    await warning.getByRole("link", { name: "Storage settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(backupPanel(page).getByText("Storage: not protected")).toBeVisible();
    await expect(backupPanel(page).getByRole("button", { name: "Ask the browser again" })).toBeVisible();
  });

  test.describe("on Safari", () => {
    test.use({ userAgent: SAFARI_UA });
    test("the warning recommends Add to Home Screen or a desktop browser", async ({ page }) => {
      await stubPersist(page, false);
      await page.goto("/onboarding");
      await expect(storageWarning(page)).toContainText("Add Korra to your Home Screen");
      await expect(storageWarning(page)).toContainText("desktop browser");
    });
    test("and says nothing about it when storage is protected", async ({ page }) => {
      await stubPersist(page, true);
      await page.goto("/onboarding");
      await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
      await expect(page.getByText("Home Screen")).toHaveCount(0);
    });
  });
});

test.describe("backup reminders", () => {
  test("30 days: never backed up, 31 days old and 5 days old; once per session; none without data", async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);

    // First run: nothing to lose yet, so nothing to remind about.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
    await settle(page);
    await expect(reminder(page)).toHaveCount(0);

    await completeOnboarding(page); // ends with a fresh page load of "/", with data and no backup ever
    await expect(reminder(page)).toBeVisible();
    await expect(reminder(page)).toContainText("Back up your data");
    await expect(reminder(page)).toContainText("not backed up yet");

    // "Later" dismisses it, and a reload in the same session does not bring it back.
    await reminder(page).getByRole("button", { name: "Later" }).click();
    await expect(reminder(page)).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await settle(page);
    await expect(reminder(page)).toHaveCount(0);

    const newSession = async (lastBackupDaysAgo: number) => {
      await page.evaluate((days) => {
        localStorage.setItem("korra.lastBackupAt", String(Date.now() - days * 86_400_000));
        sessionStorage.clear();
      }, lastBackupDaysAgo);
      await page.goto("/");
      await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page);
    };

    await newSession(5);
    await expect(reminder(page)).toHaveCount(0);

    await newSession(31);
    await expect(reminder(page)).toBeVisible();
    await expect(reminder(page)).toContainText("31 days ago");

    // "Back up now" in the reminder downloads a file, records the time and removes the reminder.
    const [download] = await Promise.all([page.waitForEvent("download"), reminder(page).getByRole("button", { name: "Back up now" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^korra-backup-\d{4}-\d{2}-\d{2}\.korra$/);
    await expect(reminder(page)).toHaveCount(0);
    const stored = Number(await page.evaluate(() => localStorage.getItem("korra.lastBackupAt")));
    expect(Date.now() - stored).toBeLessThan(60_000);

    // A garbage timestamp means "never".
    await page.evaluate(() => { localStorage.setItem("korra.lastBackupAt", "yesterday"); sessionStorage.clear(); });
    await page.goto("/");
    await expect(reminder(page)).toContainText("not backed up yet");

    expectPrivate(seen, origin);
  });

  test("a generated pack raises the reminder, once per session", async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await completeOnboarding(page);
    // Pretend the person backed up recently, so only the pack can raise the reminder.
    await page.evaluate(() => { localStorage.setItem("korra.lastBackupAt", String(Date.now())); sessionStorage.clear(); });
    await page.goto("/");
    await expect(page).toHaveURL(/\/month\?m=\d{4}-\d{2}$/);
    await settle(page);
    await expect(reminder(page)).toHaveCount(0);

    await generateEdfPack(page, origin);
    await expect(reminder(page)).toBeVisible();
    await expect(reminder(page)).toContainText("Your pack is ready.");
    await reminder(page).getByRole("button", { name: "Later" }).click();
    await expect(reminder(page)).toHaveCount(0);
    expectPrivate(seen, origin);
  });
});
