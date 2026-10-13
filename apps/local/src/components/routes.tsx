"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { yearMonthSchema } from "@korra/backend/schemas";
import { Alert, HomeScreen, MonthScreen, MonthsScreen, PackScreen, SettingsScreen, useNav, type SettingsSlots } from "@korra/ui";
import { AfterSubmitCard, renderExtraTask, useBackupTasks } from "./BackupTask";
import { BackupPanel, DataPanel } from "./DataPanels";
import { ExportPanels } from "./ExportPanels";
import { PrivacyPanel } from "./PrivacyCopy";

const Loading = () => <p className="text-sm text-muted" role="status">Loading...</p>;

// Backup/restore, exports, privacy and the danger zone belong to this app (the screen shows `backup` because `capabilities.backup` is set).
const settingsSlots: SettingsSlots = { backup: <><BackupPanel /><ExportPanels /></>, data: <><PrivacyPanel /><DataPanel /></> };
export const SettingsRoute = () => <SettingsScreen slots={settingsSlots} />;

const afterSubmit = <AfterSubmitCard />;

/** `/home?task=<id>`: the to-do list, with the app's backup task and the backup card after a pack is sent. */
export function HomeRoute() {
  const taskId = useSearchParams().get("task");
  const extraTasks = useBackupTasks(taskId);
  if (extraTasks === null) return <Loading />;
  return <HomeScreen taskId={taskId} extraTasks={extraTasks} renderExtraTask={renderExtraTask} afterSubmit={afterSubmit} />;
}

/** `/months`: the index; `/months?m=YYYY-MM`: one month. A malformed month goes back to the index. */
export function MonthsRoute() {
  const router = useRouter();
  const nav = useNav();
  const raw = useSearchParams().get("m");
  const month = raw !== null && yearMonthSchema.safeParse(raw).success ? raw : null;
  const invalid = raw !== null && month === null;

  useEffect(() => {
    if (invalid) router.replace(nav.hrefs.months());
  }, [invalid, router, nav]);

  if (invalid) return <Loading />;
  return month === null ? <MonthsScreen /> : <MonthScreen key={month} month={month} />;
}

/** `/pack?id=...` */
export function PackRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <Alert tone="danger">No pack was chosen.</Alert>;
  return <PackScreen key={id} packId={id} />;
}

/** A client-side redirect (every page here is prerendered, so there is no server redirect). */
export function RedirectTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return <Loading />;
}

/** The old `/month?m=X` URL: the same month under `/months`. */
export function MonthRedirect() {
  const m = useSearchParams().get("m");
  return <RedirectTo to={m === null ? "/months" : `/months?m=${encodeURIComponent(m)}`} />;
}
