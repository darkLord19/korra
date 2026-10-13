import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readBackup, tamper } from "./backup-file";
import { makeInvoicePdf } from "./invoice-pdf";
import { addPaymentsAndMatches, completeSetup, expectPrivate, finishReview, flow, generateEdfPack, LANDING_HEADING, makePackSkipSignature, markSent, openMonth, watchPrivacy } from "./support";

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const backupPanel = (page: Page) => page.getByRole("region", { name: "Back up and restore" });
const dataPanel = (page: Page) => page.getByRole("region", { name: "Your data" });
const storageWarning = (page: Page) => page.getByRole("region", { name: "Storage warning" });
/** The Home list's row for the backup task. It only exists while a backup is due. */
const backupRow = (page: Page) => page.locator('a[href="/home?task=backup"]');
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main", exact: true });

/** Gives a "nothing appears" assertion a moment to be wrong: the list is decided right after the screen loads. */
const settle = (page: Page) => page.waitForTimeout(500);

/** Home once its list has loaded (the greeting is part of the list, so the backup row would be there by now). */
async function openHome(page: Page): Promise<void> {
  await page.goto("/home");
  await expect(page.getByText(/^Hey 👋/)).toBeVisible();
  await settle(page);
}

/** Make the browser's answer to persist()/persisted() deterministic (Chromium may grant or deny on its own). */
async function stubPersist(page: Page, answer: boolean): Promise<void> {
  await page.addInitScript((persisted) => {
    Object.defineProperty(StorageManager.prototype, "persisted", { value: async () => persisted, configurable: true });
    Object.defineProperty(StorageManager.prototype, "persist", { value: async () => persisted, configurable: true });
  }, answer);
}

/** The Months page once it has loaded, with no trace of the invoice (a fresh start). */
async function expectNoInvoice(page: Page): Promise<void> {
  await page.goto("/months");
  await expect(page.getByRole("heading", { level: 1, name: "Months" })).toBeVisible();
  await expect(page.getByText("No invoices").first()).toBeVisible(); // the cards have loaded
  await expect(page.getByText("INV-2026-014")).toHaveCount(0);
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
    copy.querySelectorAll('section[aria-label="Notice"], section[aria-label="Storage warning"]').forEach((n) => n.remove());
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

interface Snapshot {
  month: string;
  months: string;
  pack: string;
  files: { name: string; sha256: string }[];
}

/** What the person sees: the month, the Months page with its "Payments due", the sent pack and every downloadable pack file (by content hash). */
async function snapshot(page: Page, packId: string): Promise<Snapshot> {
  const main = page.locator("main");
  await openMonth(page, /^Documents/);
  await expect(page.getByRole("button", { name: /Acme Corp/ })).toBeVisible();
  await expect(page.getByText("Bank acknowledgement")).toBeVisible();
  const month = await content(main);

  await page.goto("/months");
  await expect(page.getByRole("heading", { name: "Payments due" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "INV-2026-014" }).getByText("Realised", { exact: true })).toBeVisible();
  const months = await content(main);

  await page.goto(`/pack?id=${encodeURIComponent(packId)}`);
  const downloads = page.getByRole("link", { name: /^Download .+/ });
  await expect(downloads).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "EDF pack for September 2026" })).toBeVisible();
  const pack = await content(main);
  const files: Snapshot["files"] = [];
  for (let i = 0; i < 4; i++) {
    const [d] = await Promise.all([page.waitForEvent("download"), downloads.nth(i).click()]);
    files.push({ name: d.suggestedFilename(), sha256: createHash("sha256").update(readFileSync((await d.path())!)).digest("hex") });
  }
  return { month, months, pack, files };
}

test.describe("backup, restore and delete", () => {
  test("round trip: flow, back up, delete everything, restore, and the state is identical", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(420_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);

    await completeSetup(page);
    const { packId } = await generateEdfPack(page, origin);

    // Record the submission with an acknowledgement; then the sent celebration offers a copy of the data.
    await markSent(page, await makeInvoicePdf(["Acknowledged by the bank"]));
    await expect(flow(page).getByText("Keep a copy of your data")).toBeVisible();

    // The pack is in, so a backup is due: Home lists it as a task.
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Home" }).click();
    await expect(backupRow(page)).toBeVisible();

    // Add match and hand payment
    await addPaymentsAndMatches(page);

    const before = await snapshot(page, packId);
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
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: LANDING_HEADING })).toBeVisible();
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Let's get you set up" })).toBeVisible(); // first run again
    expect(await page.evaluate(() => localStorage.getItem("korra.lastBackupAt"))).toBeNull();
    await expectNoInvoice(page);
    await page.goto("/settings");
    await expect(backupPanel(page).getByText("Last backup: never")).toBeVisible();
    await expect(page.getByLabel("Legal name")).toHaveValue("");

    // Restore the file: choosing it asks first, and nothing changes until the person agrees.
    await backupPanel(page).getByLabel("Restore from a backup file").setInputFiles(fileA);
    const confirm = page.getByRole("alertdialog", { name: "Replace all your data with this backup?" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("replaces everything");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expectNoInvoice(page); // still empty after Cancel
    await page.goto("/settings");
    await backupPanel(page).getByLabel("Restore from a backup file").setInputFiles(fileA);
    await page.getByRole("alertdialog", { name: "Replace all your data with this backup?" }).getByRole("button", { name: "Replace my data" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText("Your backup was restored.")).toBeVisible();

    // Everything the person saw before is back, byte for byte where there are bytes.
    const after = await snapshot(page, packId);
    expect(after.month).toBe(before.month);
    expect(after.months).toBe(before.months);
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
    await completeSetup(page);
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
    await page.goto("/months");
    await expect(page.getByRole("heading", { level: 1, name: "Months" })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByLabel("Legal name")).toHaveValue("JANE DEV CONSULTING");
    await expect(page.getByLabel("GSTIN")).toHaveValue("29ABCDE1234F1Z5");
    await expect(page.getByLabel("Which bank receives your foreign payments?")).toHaveValue("kotak");
    expectPrivate(seen, origin);
  });

  test("restore and delete refuse to start while another Korra tab is open", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await completeSetup(page);
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
    await expect(page.getByLabel("Legal name")).toHaveValue("JANE DEV CONSULTING");
    await other.close();
    await page.reload();
    await expect(page.getByLabel("Legal name")).toHaveValue("JANE DEV CONSULTING");
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
    await page.goto("/months");
    await expect(page.getByRole("heading", { level: 1, name: "Months" })).toBeVisible();
    const warning = storageWarning(page);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Your data could be cleared by the browser");
    await expect(warning).toContainText("Back up regularly");
    await expect(warning.getByRole("button")).toHaveCount(0);
    await expect(warning).not.toContainText("Home Screen"); // Chrome: not a Safari problem
    await page.reload();
    await expect(storageWarning(page)).toBeVisible();

    await expect(warning.getByRole("link", { name: "Storage settings" })).toBeHidden(); // one line until opened
    await warning.getByText("How to protect it").click();
    await warning.getByRole("link", { name: "Storage settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(backupPanel(page).getByText("Storage: not protected")).toBeVisible();
    await expect(backupPanel(page).getByRole("button", { name: "Ask the browser again" })).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the banners step aside while a Home flow is open, and are back on the list and the other tabs", async ({ page }) => {
      await stubPersist(page, false);
      await page.goto("/home?task=upload:2026-09");
      await expect(flow(page).getByRole("heading", { name: "Add your September invoices" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Privacy notice" })).toBeHidden();
      await expect(storageWarning(page)).toBeHidden();

      await page.goto("/home"); // the list: both show, each a single compact strip
      await expect(page.getByRole("region", { name: "Privacy notice" })).toBeVisible();
      await expect(storageWarning(page)).toBeVisible();
      expect((await storageWarning(page).boundingBox())!.height, "the warning is a one-line strip").toBeLessThan(64);
      await expect(flow(page), "a phone shows the list only, not the hero's flow").toHaveCount(0);

      await page.goto("/months");
      await expect(storageWarning(page)).toBeVisible();
    });
  });

  test.describe("on Safari", () => {
    test.use({ userAgent: SAFARI_UA });
    test("the warning recommends Add to Home Screen or a desktop browser", async ({ page }) => {
      await stubPersist(page, false);
        await page.goto("/months");
      await expect(storageWarning(page)).toContainText("Add Korra to your Home Screen");
      await expect(storageWarning(page)).toContainText("desktop browser");
    });
    test("and says nothing about it when storage is protected", async ({ page }) => {
      await stubPersist(page, true);
        await page.goto("/months");
      await expect(page.getByRole("heading", { level: 1, name: "Months" })).toBeVisible();
      await expect(page.getByText("Home Screen")).toHaveCount(0);
    });
  });
});

test.describe("the Home backup task", () => {
  test("only once a pack exists, due when the last backup is a week old or unknown, and taking it records the time", async ({ page, context, baseURL }) => {
    test.setTimeout(300_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);

    // First run: nothing to lose yet, so nothing to back up.
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Let's get you set up" })).toBeVisible();
    await settle(page);
    await expect(backupRow(page)).toHaveCount(0);

    // Details and an invoice are not a pack yet: still no task.
    await completeSetup(page);
    await mainNav(page).getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText(/^Hey 👋/)).toBeVisible();
    await settle(page);
    await expect(backupRow(page)).toHaveCount(0);

    // A pack made in this session adds the task straight away (no reload), and sending it offers a backup too.
    // (the list catches up with the invoice being read within a poll or two, so wait for the quick checks to show)
    await page.getByRole("link", { name: "Let's go" }).and(page.locator('a[href="/home?task=review%3A2026-09"]')).click();
    await expect(page).toHaveURL(/\/home\?task=review%3A/);
    await finishReview(page);
    await makePackSkipSignature(page);
    await markSent(page);
    await expect(flow(page).getByText("Keep a copy of your data")).toBeVisible();
    await expect(flow(page).getByRole("button", { name: "Download a backup" })).toBeVisible();
    await mainNav(page).getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(backupRow(page)).toBeVisible();
    await expect(backupRow(page)).toContainText("Back up your data");

    // The week rule: 5 days is recent enough, 8 days is not, and a garbage timestamp means "never".
    const setLastBackup = async (value: string) => {
      await page.evaluate((v) => localStorage.setItem("korra.lastBackupAt", v), value);
      await openHome(page);
    };
    await setLastBackup(String(Date.now() - 5 * 86_400_000));
    await expect(backupRow(page)).toHaveCount(0);
    await setLastBackup(String(Date.now() - 8 * 86_400_000));
    await expect(backupRow(page)).toBeVisible();
    await setLastBackup("yesterday");
    await expect(backupRow(page)).toBeVisible();

    // Taking it: a .korra file, the time recorded, the task gone, and Home moves on without ever saying "already done".
    await backupRow(page).click();
    await expect(page).toHaveURL(/\/home\?task=backup$/);
    await expect(flow(page).getByRole("heading", { name: "Back up your data" })).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __alreadyDone: boolean };
      w.__alreadyDone = false;
      new MutationObserver(() => { if (document.body.textContent?.includes("already done")) w.__alreadyDone = true; })
        .observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const [download] = await Promise.all([page.waitForEvent("download"), flow(page).getByRole("button", { name: "Download a backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^korra-backup-\d{4}-\d{2}-\d{2}\.korra$/);
    await expect(page).not.toHaveURL(/task=backup/);
    await expect(backupRow(page)).toHaveCount(0);
    const stored = Number(await page.evaluate(() => localStorage.getItem("korra.lastBackupAt")));
    expect(Date.now() - stored).toBeLessThan(60_000);
    expect(await page.evaluate(() => (window as unknown as { __alreadyDone: boolean }).__alreadyDone), "the pane never flashed 'That's already done'").toBe(false);

    expectPrivate(seen, origin);
  });

  test("the card after a pack is sent backs up too, and the old reminder banner is gone", async ({ page, context, baseURL }) => {
    test.setTimeout(300_000);
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);
    await completeSetup(page);
    await generateEdfPack(page, origin);
    await markSent(page);
    const [download] = await Promise.all([page.waitForEvent("download"), flow(page).getByRole("button", { name: "Download a backup" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^korra-backup-\d{4}-\d{2}-\d{2}\.korra$/);
    await expect(flow(page).getByText(/^Saved korra-backup-/)).toBeVisible();
    const stored = Number(await page.evaluate(() => localStorage.getItem("korra.lastBackupAt")));
    expect(Date.now() - stored).toBeLessThan(60_000);

    // No banner above the page asks for a backup any more: that is the Home task's job.
    await expect(page.getByRole("region", { name: "Backup reminder" })).toHaveCount(0);
    await openHome(page);
    await expect(page.getByRole("region", { name: "Backup reminder" })).toHaveCount(0);
    expectPrivate(seen, origin);
  });
});
