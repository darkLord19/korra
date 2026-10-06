import { createServer } from "node:net";
import { defineConfig } from "@playwright/test";

/** Ask the OS for a free port so the test server never collides with a `next dev` you already have running. */
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
const port = Number(process.env.E2E_PORT ?? (process.env.E2E_PORT = String(await freePort())));

/**
 * Smoke test against `next dev` in the dev-only in-memory mode (PGlite, memory blobs, recording mailer).
 * Uses your installed Google Chrome. Without Chrome, run `pnpm exec playwright install chromium` and
 * set E2E_BROWSER=chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
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
    command: `pnpm exec next dev -p ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { KORRA_DEV_INMEMORY: "1", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
  },
});
