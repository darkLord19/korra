// Two tabs, one profile (shared IndexedDB), production build. Usage: node scripts/multitab.mjs [path=/]
// Each tab boots its own PGlite on idb://korra-spike, saves banks, then both reload and read what survived.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3101";
const path = process.argv[2] ?? "/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext();
const errs = [];
const open = async (label) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${label} pageerror: ${String(e).slice(0, 200)}`));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errs.push(`${label} console: ${m.text().slice(0, 200)}`));
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  return p;
};
const out = async (p) => JSON.parse(await p.textContent('[data-testid="out"]'));
const settle = async (p, key) =>
  p.waitForFunction((k) => document.querySelector('[data-testid="out"]')?.textContent?.includes(`"${k}"`), key, { timeout: 60000 });

const a = await open("A");
const b = await open("B");
// Both boot the DB at (nearly) the same time, on an empty store, then write.
await Promise.all([a.click('[data-testid="bank"]'), b.click('[data-testid="bank"]')]);
await Promise.all([settle(a, "bank").catch(() => undefined), settle(b, "bank").catch(() => undefined)]);
const wrote = { A: (await out(a)).bank, B: (await out(b)).bank };
// Second round of writes from each tab (now both are booted).
for (let i = 0; i < 2; i++) {
  await a.click('[data-testid="bank"]');
  await a.waitForTimeout(300);
  await b.click('[data-testid="bank"]');
  await b.waitForTimeout(300);
}
const afterWritesA = (await out(a)).bank;
const afterWritesB = (await out(b)).bank;

// Reload both and read what persisted.
await Promise.all([a.reload({ waitUntil: "networkidle" }), b.reload({ waitUntil: "networkidle" })]);
await a.click('[data-testid="read"]');
await settle(a, "read").catch(() => undefined);
const readA = (await out(a)).read;
await b.click('[data-testid="read"]');
await settle(b, "read").catch(() => undefined);
const readB = (await out(b)).read;

// Brand-new third tab reading cold.
const c = await open("C");
await c.click('[data-testid="read"]');
await settle(c, "read").catch(() => undefined);
const readC = (await out(c)).read;

const names = (r) => r?.res?.onboarding?.banks?.map((x) => x.name) ?? r;
console.log(
  JSON.stringify(
    {
      path,
      firstWrites: { A: wrote.A?.error ?? wrote.A?.res?.banks, B: wrote.B?.error ?? wrote.B?.res?.banks },
      lastWritesSeenInTab: { A: afterWritesA?.error ?? afterWritesA?.res?.banks, B: afterWritesB?.error ?? afterWritesB?.res?.banks },
      afterReload: { A: names(readA), B: names(readB), freshTabC: names(readC) },
      errors: errs,
    },
    null,
    2,
  ),
);
await browser.close();
