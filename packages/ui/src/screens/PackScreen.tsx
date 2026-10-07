"use client";
import type { ReactNode } from "react";
import type { PackDownloads } from "../api";
import { Alert } from "../components";
import { useApi } from "../context";
import { PackView } from "../pack/PackView";
import { useLoaded } from "./useLoaded";

/** The owner's pack page (`step` is an optional progress node shown above it). Pass `initial` when the app already fetched the downloads (download links expire, so a reload gets fresh ones). */
export function PackScreen({ packId, initial, step }: { packId: string; initial?: PackDownloads; step?: ReactNode }) {
  const api = useApi();
  const { data, error, reload } = useLoaded<PackDownloads>(() => api.getPackDownloads(packId), initial, packId);
  if (!data) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
  return <PackView downloads={data} onChanged={() => void reload()} {...(step !== undefined ? { step } : {})} />;
}
