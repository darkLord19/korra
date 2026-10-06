"use client";
import type { TrackerWire } from "@korra/backend/schemas";
import { Alert } from "../components";
import { useApi } from "../context";
import { TrackerView } from "../tracker/TrackerView";
import { useLoaded } from "./useLoaded";

/** The owner's realisation tracker. Pass `initial` when the app already fetched it. */
export function TrackerScreen({ initial }: { initial?: TrackerWire }) {
  const api = useApi();
  const { data, error } = useLoaded<TrackerWire>(() => api.getTracker(), initial, "tracker");
  if (!data) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
  return <TrackerView tracker={data} />;
}
