// The strict script-src for apps/local: 'self' 'wasm-unsafe-eval' plus a sha256 for every inline <script> in EVERY
// prerendered HTML page under .next/server (each client-rendered route has its own bootstrap/flight payload).
// Hashes embed chunk names, so they change whenever the app code changes: build.mjs derives them after a first
// build and bakes them into a second one. Also runnable on its own: `node scripts/csp-hashes.mjs` prints the value.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith(".html") ? [p] : [];
  });
}

export function scriptSrc(buildDir = join(root, ".next/server")) {
  const files = htmlFiles(buildDir).sort();
  if (files.length === 0) throw new Error(`no prerendered HTML under ${buildDir}`);
  const hashes = new Set();
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
    }
  }
  return { value: ["'self'", "'wasm-unsafe-eval'", ...[...hashes].sort()].join(" "), files, hashes: hashes.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(scriptSrc().value);
