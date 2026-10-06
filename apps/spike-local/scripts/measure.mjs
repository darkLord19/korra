// Measures the production build (`next start` on $BASE, default http://localhost:3101) in system Chrome.
// Usage: node scripts/measure.mjs [runs=3]
// Transfer sizes are CDP encodedDataLength (what actually went over the wire, i.e. after Next's gzip).
import { chromium } from "playwright-core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const BASE = process.env.BASE ?? "http://localhost:3101";
const RUNS = Number(process.argv[2] ?? 3);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const kind = (u) => (u.endsWith(".wasm") ? "wasm" : u.endsWith(".data") ? "data" : /\.m?js(\?|$)/.test(u) ? "js" : u.includes("/_next/") ? "other-next" : "html/other");

function tracker(cdp) {
  const urls = new Map();
  const done = [];
  cdp.on("Network.requestWillBeSent", (e) => urls.set(e.requestId, e.request.url));
  cdp.on("Network.loadingFinished", (e) => done.push({ url: urls.get(e.requestId), bytes: e.encodedDataLength }));
  return {
    take() {
      const rows = done.splice(0);
      const sum = {};
      for (const r of rows) sum[kind(r.url)] = (sum[kind(r.url)] ?? 0) + r.bytes;
      return { sum, rows };
    },
  };
}

async function readOut(page, key) {
  await page.waitForFunction((k) => document.querySelector('[data-testid="out"]')?.textContent?.includes(`"${k}"`), key, { timeout: 120000 });
  return JSON.parse(await page.textContent('[data-testid="out"]'))[key];
}

async function oneRun() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext(); // fresh profile: empty IndexedDB, empty HTTP cache
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const tr = tracker(cdp);
  const r = {};

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  r.initial = tr.take();

  await page.click('[data-testid="run"]');
  r.run = await readOut(page, "run");
  r.onClick = tr.take();

  // warm: reload (HTTP cache warm, IndexedDB populated)
  await page.reload({ waitUntil: "networkidle" });
  tr.take();
  await page.click('[data-testid="read"]');
  r.read = await readOut(page, "read");
  r.warmTransfer = tr.take();
  await browser.close();
  return r;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await oneRun());

const pick = (f) => median(runs.map(f));
const summary = {
  base: BASE,
  runs: RUNS,
  initialTransferBytes: runs[0].initial.sum,
  onClickTransferBytes: runs[0].onClick.sum,
  cold: {
    bootMs: pick((r) => r.run.res.boot.bootMs),
    firstQueryMs: pick((r) => r.run.res.boot.firstQueryMs),
    migrateMs: pick((r) => r.run.res.boot.migrateMs),
    seedMs: pick((r) => r.run.res.boot.seedMs),
    onboardingMs: pick((r) => r.run.res.onboardingMs),
    uploadMs: pick((r) => r.run.res.uploadMs),
    runIngestMs: pick((r) => r.run.res.runIngestMs),
    getMonthStateMs: pick((r) => r.run.res.getMonthStateMs),
    renderPackMs: pick((r) => r.run.res.renderPackMs),
    pdfjsMs: pick((r) => r.run.res.pdfjs.ms),
    totalFlowMs: pick((r) => r.run.ms),
  },
  warm: {
    bootMs: pick((r) => r.read.res.bootMs),
    firstQueryMs: pick((r) => r.read.res.firstQueryMs),
    migrateMs: pick((r) => r.read.res.migrateMs),
    getOnboardingMs: pick((r) => r.read.res.getOnboardingMs),
    timeToBootedMs: pick((r) => r.read.res.timeToBootedMs),
    migrationsApplied: runs[0].read.res.migrations,
    persistedBanks: runs[0].read.res.onboarding.banks.length,
    profile: runs[0].read.res.onboarding.profile?.legalName,
  },
  samples: runs.map((r) => ({ cold: r.run.res.boot, warm: { ...r.read.res, onboarding: undefined } })),
  largestOnClick: runs[0].onClick.rows.sort((a, b) => b.bytes - a.bytes).slice(0, 8),
  largestInitial: runs[0].initial.rows.sort((a, b) => b.bytes - a.bytes).slice(0, 8),
};

// Static cross-check: gzip -6 and brotli of the emitted files (what Vercel would serve; Vercel uses brotli).
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const stat = {};
for (const f of walk(join(root, ".next/static"))) {
  if (!/\.(js|wasm|data)$/.test(f)) continue;
  const b = readFileSync(f);
  const k = f.endsWith(".js") ? "js" : f.endsWith(".wasm") ? "wasm" : "data";
  (stat[k] ??= { files: 0, raw: 0, gzip: 0, brotli: 0 });
  stat[k].files++;
  stat[k].raw += b.length;
  stat[k].gzip += gzipSync(b).length;
  stat[k].brotli += brotliCompressSync(b).length;
}
summary.staticFiles = stat;
console.log(JSON.stringify(summary, null, 2));
