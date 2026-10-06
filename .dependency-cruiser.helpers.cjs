/** Helpers shared by the dependency-cruiser configs (kept out of the configs: they must be plain data). */
const fs = require("node:fs");
const path = require("node:path");

/** Recursively list source files under a directory (relative to repo root, posix). */
function listSources(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" ? [] : listSources(p);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [p] : [];
  });
}

/** Files under apps/web and packages/ui whose first statement is the given directive. */
function filesWithDirective(directive) {
  const re = new RegExp(`^\\s*(?:(?://[^\\n]*\\n|/\\*[\\s\\S]*?\\*/)\\s*)*["']${directive}["']`);
  return [...listSources("apps/web/src"), ...listSources("packages/ui/src")].filter((f) => re.test(fs.readFileSync(f, "utf8")));
}

/** Regex matching exactly the given files; matches nothing when the list is empty. */
function anyOf(files) {
  return files.length ? `^(${files.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$` : "^(?!)";
}

module.exports = { filesWithDirective, anyOf };
