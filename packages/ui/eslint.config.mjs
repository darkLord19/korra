import base from "@korra/config/eslint";

/**
 * @korra/ui is isomorphic UI: it talks to the app only through the KorraApi interface and a nav object.
 * No Next.js, and from the workspace only core and the client-safe `@korra/backend/schemas` (types and zod schemas).
 */
export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@korra/backend", message: "Import from @korra/backend/schemas only." }],
          patterns: [
            { group: ["next", "next/*"], message: "@korra/ui must not import Next.js. Use the nav context." },
            { group: ["@korra/backend/server", "@korra/backend/browser", "@korra/backend/testing"], message: "Import from @korra/backend/schemas only." },
            { group: ["@korra/db", "@korra/db/*", "@korra/ingest", "@korra/ingest/*", "@korra/packs", "@korra/packs/*", "@korra/web"], message: "@korra/ui may import only @korra/core and @korra/backend/schemas." },
            { group: ["node:*", "server-only", "better-auth", "better-auth/*"], message: "@korra/ui runs in the browser." },
          ],
        },
      ],
    },
  },
];
