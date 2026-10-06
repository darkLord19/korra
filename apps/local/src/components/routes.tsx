"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { yearMonthSchema } from "@korra/backend/schemas";
import { Alert, MonthScreen, PackScreen, SettingsScreen, TrackerScreen, OnboardingScreen, currentMonthIST, errorMessage, useApi, useNav, type SettingsSlots } from "@korra/ui";
import { BackupPanel, DataPanel } from "./DataPanels";

const Loading = () => <p className="text-sm text-muted" role="status">Loading...</p>;

/** `/`: first run goes to onboarding, otherwise to the current month. */
export function HomeRoute() {
  const api = useApi();
  const router = useRouter();
  const nav = useNav();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.getOnboarding().then(
      (ob) => { if (live) router.replace(ob.complete ? nav.hrefs.month(currentMonthIST()) : nav.hrefs.onboarding()); },
      (e: unknown) => { if (live) setError(errorMessage(e)); },
    );
    return () => { live = false; };
  }, [api, router, nav]);
  return error ? <Alert tone="danger">{error}</Alert> : <Loading />;
}

export const OnboardingRoute = () => <OnboardingScreen />;
export const TrackerRoute = () => <TrackerScreen />;
// Backup/restore and the danger zone belong to this app (the screen shows `backup` because `capabilities.backup` is set).
const settingsSlots: SettingsSlots = { backup: <BackupPanel />, data: <DataPanel /> };
export const SettingsRoute = () => <SettingsScreen slots={settingsSlots} />;

/** `/month?m=YYYY-MM`. A missing or malformed month goes to the current one; before onboarding is complete, to onboarding. */
export function MonthRoute() {
  const api = useApi();
  const router = useRouter();
  const nav = useNav();
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
      (ob) => { if (!live) return; if (ob.complete) setReady(true); else router.replace(nav.hrefs.onboarding()); },
      (e: unknown) => { if (live) setError(errorMessage(e)); },
    );
    return () => { live = false; };
  }, [api, router, nav]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (month === null || !ready) return <Loading />;
  return <MonthScreen key={month} month={month} />;
}

/** `/pack?id=...` */
export function PackRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <Alert tone="danger">No pack was chosen.</Alert>;
  return <PackScreen key={id} packId={id} />;
}
