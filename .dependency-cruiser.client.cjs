/**
 * Second dependency-cruiser pass: client-bundle boundary (design doc section 3).
 *
 * Any file under apps/web with a "use client" directive, and anything it transitively imports,
 * must not reach @korra/backend, db, ingest or packs. `import type` is allowed: this pass
 * runs with tsPreCompilationDeps=false, so type-only imports are erased from the graph.
 * "use server" files are excluded from the graph: the bundler turns them into RPC stubs, so a
 * client component importing a server action does not pull its server imports into the bundle.
 */
const helpers = require("./.dependency-cruiser.helpers.cjs");

const clientFiles = helpers.anyOf(helpers.filesWithDirective("use client"));
const serverActionFiles = helpers.anyOf(helpers.filesWithDirective("use server"));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-server-pkgs-from-client",
      severity: "error",
      comment: 'A "use client" module (transitively) imports a server-only workspace package.',
      from: { path: clientFiles },
      // `@korra/backend/schemas` (zod input schemas + wire types; pure, no server-only/db) is allowed.
      to: {
        path: "^(packages/|@korra/)(backend|db|ingest|packs)(/|$)",
        pathNot: "^(packages/backend/src/(schemas|inputs|wire-types)\\.ts|@korra/backend/schemas)$",
        reachable: true,
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      // apps/spike-local is the client-only v0 spike: its "use client" modules deliberately import the
      // isomorphic entries (db, backend, db/browser, ...) to run the use-cases in the browser.
      path: `(^|/)(\\.next|\\.turbo|node_modules)/|\\.test\\.ts$|^packages/config/|^apps/spike-local/|${serverActionFiles}`,
    },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    includeOnly: "^((apps|packages)/|@korra/)",
  },
};
