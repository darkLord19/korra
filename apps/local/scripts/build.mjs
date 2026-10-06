// Production build with the strict hash-based CSP (see next.config.ts). `next build --webpack` because Turbopack
// breaks PGlite in production builds (docs/research/2026-10-06-v0-browser-spike.md).
//   pass 1: build, discovering the sha256 of Next's inline scripts in every prerendered page
//   pass 2: rebuild with the strict script-src baked into the headers
//   check:  the hashes of the final output must equal the baked-in ones, otherwise the policy would block the app
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scriptSrc } from "./csp-hashes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");

function run(label, args, env = {}) {
  console.log(`\n[build] ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env } });
  if (r.status !== 0) {
    console.error(`[build] ${label} failed`);
    process.exit(r.status ?? 1);
  }
}

run("copy pdf.js worker", [join(root, "scripts/gen-assets.mjs")]);
// Ignore any value inherited from the environment: pass 1 must discover, not trust.
const clean = { KORRA_CSP_SCRIPT_SRC: "" };
run("pass 1: build, discovering inline-script hashes", [next, "build", "--webpack"], { ...clean, KORRA_CSP_PASS: "discover" });
const first = scriptSrc();
run(`pass 2: rebuild with the strict CSP (${first.hashes} hashes from ${first.files.length} pages)`, [next, "build", "--webpack"], { KORRA_CSP_SCRIPT_SRC: first.value });
const final = scriptSrc();
if (final.value !== first.value) {
  console.error("[build] the inline scripts changed between passes, so the baked-in CSP hashes are stale. The build is not deterministic.");
  process.exit(1);
}
console.log(`\n[build] strict CSP in place: script-src ${final.value}`);
