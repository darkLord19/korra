/**
 * Enforces docs/design/phase1-architecture.md section 3 ("Allowed imports").
 *
 *   apps/web ──► backend (server files only), core
 *   backend  ──► core, ingest, packs, db
 *   ingest / packs / db ──► core
 *   core     ──► nothing in the workspace
 */
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
    exclude: { path: "(^|/)(\\.next|\\.turbo|node_modules)/|\\.test\\.ts$|^packages/config/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
    includeOnly: "^((apps|packages)/|@korra/)",
  },
};

