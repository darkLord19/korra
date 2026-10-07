"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { yearMonthSchema } from "@korra/backend/schemas";
import { Alert, MonthScreen, PackScreen, SettingsScreen, TrackerScreen, OnboardingScreen, currentMonthIST, errorMessage, useApi, useNav, type SettingsSlots } from "@korra/ui";
import { setFlow, useFlow } from "@/lib/flow";
import { fileHeldInvoice, holdInvoice } from "@/lib/pending-invoice";
import { BackupPanel, DataPanel } from "./DataPanels";
import { ExportPanels } from "./ExportPanels";
import { KeepTrackingCard } from "./KeepTrackingCard";
import { PrivacyPanel } from "./PrivacyCopy";

const Loading = () => <p className="text-sm text-muted" role="status">Loading...</p>;

export const OnboardingRoute = () => (
  <OnboardingScreen
    step="Step 1 of 3 · Your details"
    onSaved={(invoice) => { holdInvoice(invoice); setFlow("started"); }}
  />
);
export const TrackerRoute = () => <TrackerScreen />;
// Backup/restore, exports, privacy and the danger zone belong to this app (the screen shows `backup` because `capabilities.backup` is set).
const settingsSlots: SettingsSlots = { backup: <><BackupPanel /><ExportPanels /></>, data: <><PrivacyPanel /><DataPanel /></> };
export const SettingsRoute = () => <SettingsScreen slots={settingsSlots} />;

/** `/month?m=YYYY-MM`. A missing or malformed month goes to the current one; before onboarding is complete, to onboarding. */
export function MonthRoute() {
  const api = useApi();
  const router = useRouter();
  const nav = useNav();
  const flow = useFlow();
  const raw = useSearchParams().get("m");
  const month = raw !== null && yearMonthSchema.safeParse(raw).success ? raw : null;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (month === null) router.replace(nav.hrefs.month(currentMonthIST()));
  }, [month, router, nav]);

  useEffect(() => {
    let live = true;
    api.getOnboarding().then(
      async (ob) => {
        if (!live) return;
        if (!ob.complete) return router.replace(nav.hrefs.onboarding());
        // An invoice that filled in the setup form is filed first, so the page's first load already lists it (under its own month).
        const filedIn = await fileHeldInvoice(api);
        if (!live) return;
        if (filedIn) router.replace(nav.hrefs.month(filedIn));
        setReady(true);
      },
      (e: unknown) => { if (live) setError(errorMessage(e)); },
    );
    return () => { live = false; };
  }, [api, router, nav]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (month === null || !ready) return <Loading />;
  return <MonthScreen key={month} month={month} mode={flow === "tracking" ? "full" : "edf"} />;
}

/** `/pack?id=...` */
export function PackRoute() {
  const id = useSearchParams().get("id");
  const flow = useFlow();
  if (!id) return <Alert tone="danger">No pack was chosen.</Alert>;
  return (
    <>
      <PackScreen key={id} packId={id} />
      {flow !== "tracking" && <KeepTrackingCard />}
    </>
  );
}
