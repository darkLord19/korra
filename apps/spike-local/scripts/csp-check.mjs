// Loads the production build, records CSP violations and any request that leaves the origin, then runs the
// full flow in plain and worker mode. Usage: node scripts/csp-check.mjs
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3101";
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const mode of ["plain", "worker"]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const violations = [];
  const external = [];
  page.on("console", (m) => /Content Security Policy|violat/i.test(m.text()) && violations.push(m.text().slice(0, 220)));
  ctx.on("request", (r) => !r.url().startsWith(BASE) && !r.url().startsWith("blob:") && !r.url().startsWith("data:") && external.push(r.url()));
  await page.goto(`${BASE}/${mode === "worker" ? "?mode=worker" : ""}`, { waitUntil: "networkidle" });
  const hydrated = await page.evaluate(() => !!document.querySelector("[data-testid=run]") && Object.keys(document.querySelector("[data-testid=run]")).some((k) => k.startsWith("__reactProps")));
  await page.click('[data-testid="run"]');
  let result;
  try {
    await page.waitForFunction(() => document.querySelector('[data-testid="out"]')?.textContent?.includes('"run"'), null, { timeout: 30000 });
    const o = JSON.parse(await page.textContent('[data-testid="out"]')).run;
    result = o.error ? "ERROR " + o.error.slice(0, 160) : `ok (pdfjs pages=${o.res.pdfjs.pages}, payments=${o.res.payments})`;
  } catch {
    result = "no result (button inert or hung)";
  }
  console.log(JSON.stringify({ mode, hydrated, result, violations: [...new Set(violations)], externalRequests: external }, null, 1));
  await ctx.close();
}
await browser.close();
