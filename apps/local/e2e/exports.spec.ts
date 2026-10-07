import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import JSZip from "jszip";
import { expect, test, type Download, type Page } from "@playwright/test";
import { addPaymentsAndMatches, completeOnboarding, enterTracking, expectPrivate, generateEdfPack, MONTH, watchPrivacy } from "./support";

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const LEAD = "Your documents and details are stored only in this browser. Korra has no server copy. Back up regularly.";
const DISCLAIMER = "Korra prepares documents; you or your CA submit them. Not legal or tax advice.";

const notice = (page: Page) => page.getByRole("region", { name: "Privacy notice" });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = async (d: Download) => new Uint8Array(readFileSync((await d.path())!));
const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
const usd = (major: string) => `USD ${Number(major).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const stripStamp = (ics: string) => ics.split("\r\n").filter((l) => !l.startsWith("DTSTAMP:")).join("\r\n");

test.describe("first-run privacy notice and the Privacy page", () => {
  test("appears once, dismisses, stays dismissed after a reload; the Privacy page and Settings section render", async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const seen = await watchPrivacy(page, context);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText(LEAD);
    await expect(notice(page)).toContainText(DISCLAIMER);
    await notice(page).getByRole("button", { name: "Got it" }).click();
    await expect(notice(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Set up your details" })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);

    // The footer links to the permanent page.
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    const article = page.getByRole("article");
    await expect(article.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
    await expect(article).toContainText(LEAD);
    for (const h of ["What is stored, and where", "What leaves your device", "Back up and restore", "Delete all local data", "Your browser can clear this data", "Exports are copies"]) {
      await expect(article.getByRole("heading", { name: h })).toBeVisible();
    }
    await expect(article).toContainText(DISCLAIMER);
    // Usage counts are a later stage: nothing about them (or metrics) yet.
    await expect(article).not.toContainText(/usage counts|metrics|anonymous usage/i);
    await expect(page.getByText("Home Screen")).toHaveCount(0); // not Safari

    // Settings has a Privacy section too (data is still empty: Settings needs onboarding data to render its forms).
    await enterTracking(page);
    await page.goto("/settings");
    await expect(page.getByRole("region", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Privacy" }).getByRole("link", { name: /how your data is handled/i })).toHaveAttribute("href", "/privacy");

    expectPrivate(seen, origin);
  });

  test("a notice that was never dismissed is shown again after a reload", async ({ page }) => {
    await page.goto("/privacy");
    await expect(notice(page)).toBeVisible();
    await page.reload();
    await expect(notice(page)).toBeVisible();
  });

  test.describe("on Safari", () => {
    test.use({ userAgent: SAFARI_UA });
    test("the Privacy page recommends Add to Home Screen or a desktop browser", async ({ page }) => {
      await page.goto("/privacy");
      await expect(page.getByRole("article")).toContainText("Add Korra to your Home Screen");
      await expect(page.getByRole("article")).toContainText("desktop browser");
    });
  });
});

test("calendar and CA exports: built in the browser from the same data the screens show, nothing leaves the device", async ({ page, context, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;
  const seen = await watchPrivacy(page, context);

  await completeOnboarding(page);
  await generateEdfPack(page, origin);

  // What the pack screen offers, by content hash.
  const links = page.getByRole("link", { name: "Download" });
  const shown: Record<string, string> = {};
  for (let i = 0; i < 4; i++) {
    const [d] = await Promise.all([page.waitForEvent("download"), links.nth(i).click()]);
    shown[d.suggestedFilename()] = sha(await bytesOf(d));
  }
  expect(Object.keys(shown)).toHaveLength(4);

  // Mark it submitted, then enter tracking and confirm matches + hand payment.
  await page.getByRole("button", { name: "Mark as submitted" }).click();
  await expect(page.getByText(/^Submitted \d/)).toBeVisible();

  await enterTracking(page);
  await addPaymentsAndMatches(page);

  // Add a second invoice by hand that has no payment: it stays open, so it has real deadlines and alerts.
  await page.goto(`/month?m=${MONTH}`);
  await page.getByRole("button", { name: "Add invoice by hand" }).click();
  const form = page.getByRole("form", { name: "Add invoice by hand" });
  await form.getByLabel("Invoice number").fill("INV-2026-099");
  await form.getByLabel("Invoice date").fill("2026-09-20");
  await form.getByLabel("Client name").fill("Zenith Labs");
  await form.getByLabel("Client country").fill("DE");
  await form.getByLabel("Client address").fill("5 Hauptstrasse, Berlin");
  await form.getByLabel("Invoice amount", { exact: true }).fill("1234.56");
  await form.getByLabel("Service description").fill("Consulting");
  await form.getByLabel("SAC code").fill("998314");
  await form.getByRole("button", { name: "Save invoice" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Invoice INV-2026-099" })).toBeVisible();

  // The tracker, as the person sees it.
  await page.goto("/tracker");
  const screen: Record<string, string[]> = {};
  for (const no of ["INV-2026-014", "INV-2026-099"]) {
    const tr = page.getByRole("row", { name: new RegExp(no) });
    await expect(tr.getByRole("cell")).toHaveCount(9);
    screen[no] = await tr.getByRole("cell").allInnerTexts();
  }
  expect(screen["INV-2026-014"]![7]).toBe("Realised");
  expect(screen["INV-2026-099"]![7]).toBe("Open");

  /* ------------------------------- the calendar ------------------------------- */
  await page.goto("/settings");
  await expect(page.getByText(/Re-download after your data changes — Korra has no server to update your calendar\./)).toBeVisible();
  const [icsDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download calendar (.ics)" }).click()]);
  expect(icsDownload.suggestedFilename()).toBe("korra-calendar.ics");
  const ics = Buffer.from(await bytesOf(icsDownload)).toString("utf8");
  await expect(page.getByText(/^Saved korra-calendar\.ics with \d+ entr/)).toBeVisible();

  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line), line).toBeLessThanOrEqual(75);
  const cal = new ICAL.Component(ICAL.parse(ics));
  expect(cal.getFirstPropertyValue("version")).toBe("2.0");
  expect(cal.getFirstPropertyValue("prodid")).toContain("Korra");
  expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Korra deadlines");
  const events = cal.getAllSubcomponents("vevent").map((e) => ({
    uid: String(e.getFirstPropertyValue("uid")),
    start: String(e.getFirstProperty("dtstart")!.getFirstValue()),
    allDay: e.getFirstProperty("dtstart")!.type === "date",
    summary: String(e.getFirstPropertyValue("summary")),
    stamp: String(e.getFirstPropertyValue("dtstamp")),
  }));
  expect(events.every((e) => e.allDay)).toBe(true);
  expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  // The deadline on the tracker screen is the deadline in the calendar (9 months after 20 Sep 2026); the realised invoice has none.
  expect(screen["INV-2026-099"]![6]).toBe(dateLabel("2027-06-20"));
  const today = todayIST();
  // Alerts already in the past are left out, so they depend on the day this runs; the due date and the deadline always stay.
  const expected = [
    { date: "2026-10-30", summary: "EDF due: September 2026 invoices", alert: false }, // last day of September + 30 days
    { date: "2027-04-21", summary: "60 days to realisation deadline: INV-2026-099", alert: true },
    { date: "2027-05-21", summary: "30 days to realisation deadline: INV-2026-099", alert: true },
    { date: "2027-06-20", summary: "Realisation deadline: INV-2026-099", alert: false },
  ].filter((e) => !e.alert || e.date >= today);
  expect(events.map((e) => `${e.start} ${e.summary}`).sort()).toEqual(expected.map((e) => `${e.date} ${e.summary}`).sort());
  expect(events.some((e) => e.summary.includes("INV-2026-014")), "a realised invoice has no events").toBe(false);
  expect(Date.now() - Date.parse(events[0]!.stamp)).toBeLessThan(5 * 60_000);
  // Harmless if shared: no client, amount, PAN, GSTIN or exporter name.
  for (const secret of ["Acme", "Zenith", "Jane", "ABCDE1234F", "29ABCDE", "1234", "1,500", "1500", "USD"]) expect(ics, secret).not.toContain(secret);

  /* ------------------------------ the CA export ------------------------------- */
  await expect(page.getByText(/copy of your records as they are now, not live sharing/)).toBeVisible();
  const [zipDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export for my CA" }).click()]);
  const name = zipDownload.suggestedFilename();
  const local = new Date();
  const ymd = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  expect(name).toBe(`korra-ca-export-${ymd}.zip`);
  await expect(page.getByText(`Saved ${name} with 1 pack and 2 invoices.`)).toBeVisible();
  const zip = await JSZip.loadAsync(await bytesOf(zipDownload));
  const entries = Object.keys(zip.files).sort();
  const packDir = "packs/2026-09-kotak-mahindra-bank/";
  expect(entries).toEqual([
    "README.txt",
    "korra-calendar.ics",
    ...Object.keys(shown).map((n) => `${packDir}${n}`).sort(),
    "tracker.csv",
  ]);
  expect(entries.some((n) => n.startsWith("declarations"))).toBe(false);

  // The pack files are the ones the pack screen offered, byte for byte.
  for (const [n, hash] of Object.entries(shown)) expect(sha(await zip.file(`${packDir}${n}`)!.async("uint8array")), n).toBe(hash);

  // The calendar inside is the calendar from Settings (only DTSTAMP, the moment it was made, differs).
  expect(stripStamp(await zip.file("korra-calendar.ics")!.async("string"))).toBe(stripStamp(ics));

  // The tracker CSV has one row per tracker row, with the values the screen shows.
  const csvText = await zip.file("tracker.csv")!.async("string");
  expect(csvText.startsWith("\uFEFF")).toBe(true);
  const csv = csvText.slice(1).split("\r\n").filter(Boolean);
  expect(csv[0]).toBe("Invoice no.,Client,Invoice date,EDF month,Currency,Invoice amount,Realised amount,Outstanding amount,Realisation due date,Status,Matched payments");
  expect(csv).toHaveLength(3);
  const row = (no: string) => csv.find((l) => l.startsWith(`${no},`))!.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const r14 = row("INV-2026-014");
  expect(r14.slice(0, 10)).toEqual(["INV-2026-014", "Acme Corp", "2026-09-02", "2026-09", "USD", "1500.00", "1500.00", "0.00", "2027-06-02", "Realised"]);
  expect(r14[10]).toMatch(/^2026-09-05 USD 1500\.00/); // the Deel withdrawal confirmed against it
  const r99 = row("INV-2026-099");
  expect(r99).toEqual(["INV-2026-099", "Zenith Labs", "2026-09-20", "2026-09", "USD", "1234.56", "0.00", "1234.56", "2027-06-20", "Open", ""]);
  for (const [no, r] of [["INV-2026-014", r14], ["INV-2026-099", r99]] as const) {
    const cells = screen[no]!;
    expect(cells[1], no).toBe(r[1]);
    expect(cells[2], no).toBe(dateLabel(r[2]!));
    expect(cells[3], no).toBe(usd(r[5]!));
    expect(cells[4], no).toBe(usd(r[6]!));
    expect(cells[5], no).toBe(usd(r[7]!));
    expect(cells[6], no).toBe(dateLabel(r[8]!));
    expect(cells[7], no).toBe(r[9]);
  }

  // README: what it is, that it is a local copy, and where things are.
  const readme = await zip.file("README.txt")!.async("string");
  expect(readme).toContain(`Made on ${ymd}`);
  expect(readme).toMatch(/COPY of the exporter's records/);
  expect(readme).toMatch(/not live sharing/);
  expect(readme).toMatch(/Nothing was uploaded/);
  for (const part of ["tracker.csv", "korra-calendar.ics", "packs/2026-09-kotak-mahindra-bank/", "marked submitted", DISCLAIMER]) expect(readme).toContain(part);

  // Privacy: building and downloading both files made no request that leaves the origin or changes anything.
  expectPrivate(seen, origin);
});
