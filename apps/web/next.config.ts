import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source (no per-package build).
  transpilePackages: ["@korra/core", "@korra/backend", "@korra/db", "@korra/ingest", "@korra/packs"],
};

export default nextConfig;
