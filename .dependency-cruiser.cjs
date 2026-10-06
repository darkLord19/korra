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
    edge("core-imports-nothing", "^packages/core/", "^(packages/(ingest|packs|db|backend)/|apps/|@korra/(ingest|packs|db|backend|web)(/|$))", "core is pure domain; no workspace deps."),
    edge("ingest-only-core", "^packages/ingest/", "^(packages/(packs|db|backend)/|apps/|@korra/(packs|db|backend|web)(/|$))", "ingest may import core only."),
    edge("packs-only-core", "^packages/packs/", "^(packages/(ingest|db|backend)/|apps/|@korra/(ingest|db|backend|web)(/|$))", "packs may import core only."),
    edge("db-only-core", "^packages/db/", "^(packages/(ingest|packs|backend)/|apps/|@korra/(ingest|packs|backend|web)(/|$))", "db may import core only."),
    edge("backend-no-apps", "^packages/backend/", "^(apps/|@korra/web(/|$))", "backend must not import apps."),
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
      from: { path: "^packages/backend/src/(schemas|inputs|wire-types)\\.ts$" },
      to: { path: "^(packages/(db|ingest|packs)/|@korra/(db|ingest|packs)(/|$)|server-only|node_modules/server-only)" },
    },
    {
      name: "iso-entries-stay-isomorphic",
      comment:
        "The main entries (db, ingest, packs, backend), the browser entries (db/browser, backend/browser), ingest/pdf, backend/schemas and everything under apps/local run in the browser. " +
        "Nothing reachable from them may be a /server entry or a server-only module (postgres, Supabase, Anthropic, Better Auth, Resend, server-only, node:*).",
      severity: "error",
      from: {
        path: "^(packages/(db|ingest|packs|backend)/src/(index|browser|pdf|schemas)\\.ts|apps/local/)",
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
        path: "^(packages/(db|ingest|packs|backend)/src/(index|browser|pdf|schemas)\\.ts|apps/local/)",
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
    exclude: { path: "(^|/)(\\.next|\\.turbo)/|\\.test\\.ts$|^packages/config/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    // Server-only third-party packages stay in the graph (as leaves) so the isomorphic rules can see them.
    includeOnly: { path: ["^(apps|packages)/", "^@korra/", "node_modules/(better-auth|resend|postgres|server-only|@supabase|@anthropic-ai)/", "^node:", NODE_BUILTINS] },
  },
};

