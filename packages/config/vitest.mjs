import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Shared vitest config. `server-only` throws outside a React Server env, so alias it
 * to an empty stub in tests.
 */
export const serverOnlyStub = fileURLToPath(new URL("./vitest/server-only-stub.js", import.meta.url));

export function korraVitestConfig() {
  return defineConfig({
    resolve: { alias: { "server-only": serverOnlyStub } },
    test: { include: ["src/**/*.test.ts"] },
  });
}
