import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * Content Security Policy, sent on EVERY path (not only the HTML pages): dedicated workers (the PGlite worker and
 * the pdf.js worker) take their CSP from the response that served the worker script, so the header must also be
 * on /_next/static/** and /pdfjs/**.
 *
 * Production: `script-src 'self' 'wasm-unsafe-eval'` plus the sha256 of each of Next's inline bootstrap scripts.
 * Those hashes depend on the build output, so `scripts/build.mjs` builds twice: the first pass (KORRA_CSP_PASS=discover)
 * only discovers them, the second bakes them in via KORRA_CSP_SCRIPT_SRC. A production build with neither fails closed
 * (no hashes, so the app does not start): a loose policy can never ship by accident.
 *
 * `style-src` keeps 'unsafe-inline': Next and React inject inline <style>/style attributes (and the screens use
 * style props). Styles cannot run script, and no third-party origin is allowed, so the privacy guarantee
 * (connect-src 'self', no third-party origins) is unaffected.
 *
 * `next dev` is relaxed (HMR needs 'unsafe-eval' and inline scripts). It never reaches users.
 */
function scriptSrc(phase: string): string {
  if (phase === PHASE_DEVELOPMENT_SERVER) return "'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline'";
  if (process.env.KORRA_CSP_SCRIPT_SRC) return process.env.KORRA_CSP_SCRIPT_SRC;
  if (process.env.KORRA_CSP_PASS === "discover") return "'self' 'wasm-unsafe-eval' 'unsafe-inline'";
  // No hashes (a plain `next build`, which also runs for `next typegen`): fail closed. The policy then blocks Next's
  // inline scripts, so the app visibly does not start, rather than shipping a loose script-src.
  return "'self' 'wasm-unsafe-eval'";
}

const csp = (phase: string) => [
  "default-src 'self'",
  `script-src ${scriptSrc(phase)}`,
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export default function config(phase: string): NextConfig {
  const policy = csp(phase);
  return {
    // Workspace packages are consumed as TypeScript source (no per-package build).
    transpilePackages: ["@korra/core", "@korra/backend", "@korra/db", "@korra/ingest", "@korra/packs", "@korra/ui"],
    // The build id is embedded in an inline script; a random one would change that script's CSP hash on every build.
    generateBuildId: async () => "korra-local",
    async headers() {
      return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: policy }] }];
    },
  };
}
