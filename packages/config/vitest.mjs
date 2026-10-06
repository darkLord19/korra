import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Shared vitest config. `server-only` throws outside a React Server env, so alias it
 * to an empty stub in tests. PGlite and Better Auth are slow on CI runners, so the
 * default 5 s timeout is raised (override per package with `{ testTimeout, hookTimeout }`).
 */
export const serverOnlyStub = fileURLToPath(new URL("./vitest/server-only-stub.js", import.meta.url));

export function korraVitestConfig({ testTimeout = 30_000, hookTimeout = 30_000 } = {}) {
  return defineConfig({
    resolve: { alias: { "server-only": serverOnlyStub } },
    test: { include: ["src/**/*.test.ts"], testTimeout, hookTimeout },
  });
}
