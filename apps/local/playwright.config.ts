import { createServer } from "node:net";
import { defineConfig } from "@playwright/test";

/** Ask the OS for a free port so this suite never collides with apps/web's e2e or a dev server you already have running. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

// Playwright re-evaluates this file in each worker; pin the port in the environment so they all agree.
// (A variable of its own: apps/web's suite uses E2E_PORT.)
const port = Number(process.env.LOCAL_E2E_PORT ?? (process.env.LOCAL_E2E_PORT = String(await freePort())));

/**
 * Runs against the production build with the strict hash-based CSP (`pnpm build` = the two-pass build), because the
 * privacy claim is about what ships, not about `next dev`. Set LOCAL_E2E_REUSE_BUILD=1 to skip the build when
 * `.next` is already a fresh `pnpm build`. Uses your installed Google Chrome; without it, run
 * `pnpm exec playwright install chromium` and set E2E_BROWSER=chromium (as for apps/web's suite).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    ...(process.env.E2E_BROWSER === "chromium" ? {} : { channel: "chrome" }),
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${process.env.LOCAL_E2E_REUSE_BUILD ? "node scripts/gen-assets.mjs" : "pnpm build"} && pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
  },
});
