// Copies the pdf.js worker out of node_modules into public/pdfjs/ so it is served from our own origin
// (the CSP allows no third-party origins). The copy is generated, not committed (see .gitignore).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve("pdfjs-dist/package.json"));
mkdirSync(join(root, "public/pdfjs"), { recursive: true });
copyFileSync(join(pdfjsDir, "build/pdf.worker.min.mjs"), join(root, "public/pdfjs/pdf.worker.min.mjs"));
console.log("assets generated");
