// Prints the script-src value for the strict CSP: 'self' 'wasm-unsafe-eval' plus a sha256 for every inline
// <script> in the prerendered HTML (Next's bootstrap/flight payload scripts). Hashes change when the app code
// changes (they embed chunk names), so run after `next build` and rebuild with SPIKE_SCRIPT_SRC=<output>.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), ".next/server/app/index.html"), "utf8");
const hashes = new Set();
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  hashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
}
// SPIKE_NO_WASM=1 drops 'wasm-unsafe-eval' to prove it is required (PGlite/initdb instantiate WebAssembly).
console.log(["'self'", ...(process.env.SPIKE_NO_WASM ? [] : ["'wasm-unsafe-eval'"]), ...hashes].join(" "));
