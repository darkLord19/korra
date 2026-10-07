"use client";
import type { ReactNode } from "react";
import type { AdBankWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { Alert } from "../components";
import { useApi } from "../context";
import { MonthView } from "../month/MonthView";
import { useLoaded } from "./useLoaded";

export interface MonthData {
  state: MonthStateWire;
  banks: AdBankWire[];
  packs: PackWire[];
}

/**
 * The owner's month page: loads the month through `KorraApi`, reloads after every change and while documents
 * are being read. Pass `initial` when the app already fetched it (server rendering) to skip the first load.
 */
export function MonthScreen({ month, initial, uploadDescription, mode = "full" }: { month: string; initial?: MonthData; uploadDescription?: ReactNode; mode?: "full" | "edf" }) {
  const api = useApi();
  const { data, error, reload } = useLoaded<MonthData>(
    async () => {
      const [state, onboarding, packs] = await Promise.all([api.getMonthState(month), api.getOnboarding(), api.listPacks(month)]);
      return { state, banks: onboarding.banks, packs };
    },
    initial,
    month,
  );
  if (!data) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
  return (
    <>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <MonthView month={month} state={data.state} banks={data.banks} packs={data.packs} onChanged={() => void reload()} onPoll={() => void reload()}
        mode={mode}
        {...(uploadDescription !== undefined ? { uploadDescription } : {})} />
    </>
  );
}
