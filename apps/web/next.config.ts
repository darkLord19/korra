import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source (no per-package build).
  transpilePackages: ["@korra/core", "@korra/backend", "@korra/db", "@korra/ingest", "@korra/packs", "@korra/ui"],
  // Dev in-memory mode (KORRA_DEV_INMEMORY=1) runs PGlite, which loads its wasm/data from disk.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
