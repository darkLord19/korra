import type { NextConfig } from "next";

// Applied to every path (not just `/`): dedicated workers (PGliteWorker, pdf.js) take their CSP from the
// response that served the worker script, so the header must be on /_next/static/** and /pdfjs/** too.
const scriptSrc = process.env.SPIKE_SCRIPT_SRC ?? "'self' 'wasm-unsafe-eval' 'unsafe-inline'";
const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "img-src 'self' blob: data:",
  `style-src ${process.env.SPIKE_STYLE_SRC ?? "'self' 'unsafe-inline'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source (no per-package build).
  transpilePackages: ["@korra/core", "@korra/backend", "@korra/db", "@korra/ingest", "@korra/packs"],
  // The build id is embedded in an inline script; a random one changes that script's CSP hash on every build.
  generateBuildId: async () => process.env.SPIKE_BUILD_ID ?? "korra-local",
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

export default nextConfig;
