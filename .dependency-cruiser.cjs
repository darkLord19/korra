/**
 * Enforces docs/design/phase1-architecture.md section 3 ("Allowed imports").
 *
 *   apps/web ──► backend (server files only), core
 *   backend  ──► core, ingest, packs, db
 *
 * Entry map: every package's main entry is isomorphic (runs in the browser too); server-only code lives in
 * `<pkg>/src/server.ts` (`@korra/<pkg>/server`, starts with `import "server-only"`); browser adapters in
 * `db/browser`, `backend/browser`, `ingest/pdf`. See docs/design/v0-client-only-and-declarations.md section A2.
 *   ingest / packs / db ──► core
 *   core     ──► nothing in the workspace
 *   ui       ──► core, backend/schemas (types + zod only); never backend main, db, ingest, packs
 */
/** Node core modules (depcruise resolves `node:fs` to `fs`). */
const NODE_BUILTINS = "^(fs|path|crypto|os|url|buffer|stream|zlib|http|https|net|child_process|worker_threads)$";

/** Package-edge rule: modules under `from` must not import any `to` packages. */
const edge = (name, from, to, comment) => ({
  name,
  comment,
  severity: "error",
  from: { path: from },
  to: { path: to },
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    edge("core-imports-nothing", "^packages/core/", "^(packages/(ingest|packs|db|backend|ui)/|apps/|@korra/(ingest|packs|db|backend|ui|web)(/|$))", "core is pure domain; no workspace deps."),
    edge("ingest-only-core", "^packages/ingest/", "^(packages/(packs|db|backend)/|apps/|@korra/(packs|db|backend|web)(/|$))", "ingest may import core only."),
    edge("packs-only-core", "^packages/packs/", "^(packages/(ingest|db|backend)/|apps/|@korra/(ingest|db|backend|web)(/|$))", "packs may import core only."),
    edge("db-only-core", "^packages/db/", "^(packages/(ingest|packs|backend)/|apps/|@korra/(ingest|packs|backend|web)(/|$))", "db may import core only."),
    edge("backend-no-apps", "^packages/backend/", "^(apps/|packages/ui/|@korra/(web|ui)(/|$))", "backend must not import apps or the UI package."),
    edge(
      "ui-only-core-and-schemas",
      "^packages/ui/",
      "^(packages/(ingest|packs|db)/|apps/|@korra/(ingest|packs|db|web)(/|$))",
      "@korra/ui is isomorphic UI: it may import only @korra/core and @korra/backend/schemas (and react).",
    ),
    {
      name: "ui-backend-schemas-only",
      comment: "@korra/ui may import the backend's client-safe schemas entry (zod input schemas and wire types), never its main entry or server/browser entries.",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: {
        path: "^(packages/backend/|@korra/backend(/|$))",
        pathNot: "^(packages/backend/src/(schemas|inputs|wire-types|wire-values)\\.ts|@korra/backend/schemas)$",
      },
    },
    edge(
      "web-no-direct-server-pkgs",
      "^apps/web/",
      "^(packages/|@korra/)(db|ingest|packs)(/|$)",
      "apps/web reaches behaviour only through @korra/backend.",
    ),
    {
      name: "backend-schemas-pure",
      comment: "The client-safe schemas entry may import only zod and core, never db, ingest, packs or server-only.",
      severity: "error",
      from: { path: "^packages/backend/src/(schemas|inputs|wire-types|wire-values)\\.ts$" },
      to: { path: "^(packages/(db|ingest|packs)/|@korra/(db|ingest|packs)(/|$)|server-only|node_modules/server-only)" },
    },
    {
      name: "iso-entries-stay-isomorphic",
      comment:
        "The main entries (db, ingest, packs, backend), the browser entries (db/browser, backend/browser), ingest/pdf, backend/schemas, packages/ui and everything under apps/local/src run in the browser (apps/local/scripts, e2e and playwright.config.ts are Node tooling). " +
        "Nothing reachable from them may be a /server entry or a server-only module (postgres, Supabase, Anthropic, Better Auth, Resend, server-only, node:*).",
      severity: "error",
      from: {
        path: "^(packages/(db|ingest|packs|backend)/src/(index|browser|pdf|schemas)\\.ts|packages/ui/src/|apps/local/src/)",
      },
      to: {
        path: [
          // our own server entries and the modules that exist only for them
          "^packages/[^/]+/src/server\\.ts$",
          "^@korra/[^/]+/server$",
          "^packages/(db/src/(db|blob-supabase)|ingest/src/claude|backend/src/(deps|auth|env|mailer-resend))\\.ts$",
          // third-party server packages
          "(^|/)node_modules/(better-auth|resend|postgres|server-only|@supabase/[^/]+|@anthropic-ai/[^/]+)/",
          "^(better-auth|resend|postgres|server-only|@supabase/|@anthropic-ai/)",
        ],
        reachable: true,
      },
    },
    {
      name: "iso-entries-no-node-builtins",
      comment: "Browser-reachable code must not import Node built-ins (node:fs, node:crypto, ...). Use Web APIs (globalThis.crypto).",
      severity: "error",
      from: {
        path: "^(packages/(db|ingest|packs|backend)/src/(index|browser|pdf|schemas)\\.ts|packages/ui/src/|apps/local/src/)",
      },
      to: { path: ["^node:", NODE_BUILTINS], reachable: true },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  // Note: an undeclared workspace import (e.g. core -> @korra/db) does not resolve under pnpm,
  // so the rules above also match the bare "@korra/x" specifier.
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(\\.next|\\.turbo)/|\\.test\\.tsx?$|^packages/ui/src/test-(utils|setup)\\.tsx?$|^packages/config/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    // Server-only third-party packages stay in the graph (as leaves) so the isomorphic rules can see them.
    includeOnly: { path: ["^(apps|packages)/", "^@korra/", "node_modules/(better-auth|resend|postgres|server-only|@supabase|@anthropic-ai)/", "^node:", NODE_BUILTINS] },
  },
};

