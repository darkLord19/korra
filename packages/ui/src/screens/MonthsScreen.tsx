"use client";
import { useEffect, useState } from "react";
import type { MonthStateWire, PackWire, TrackerWire } from "@korra/backend/schemas";
import { Alert, Badge, Skeleton } from "../components";
import { useApi, useNav } from "../context";
import { errorMessage } from "../errors";
import { monthStage, STAGE_LABEL, STAGE_TONE } from "../home/stage";
import { currentMonthIST, money, monthLabel, shiftMonth, sumMoney } from "../lib/format";
import { TrackerView } from "../tracker/TrackerView";

const WINDOW = 12;
const BATCH = 4;

interface MonthsData {
  states: Map<string, MonthStateWire>;
  packs: PackWire[];
  tracker: TrackerWire | null;
}

/**
 * The months index: a card for the current month and each of the last eleven that has invoices or a pack (plus any
 * older month a pack was made for), then "Payments due". Months load four at a time.
 */
export function MonthsScreen() {
  const api = useApi();
  const { Link, hrefs } = useNav();
  const [data, setData] = useState<MonthsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [packs, tracker] = await Promise.all([api.listPacks(), api.getTracker().catch(() => null)]);
        const cur = currentMonthIST();
        const window = Array.from({ length: WINDOW }, (_, i) => shiftMonth(cur, -i));
        const months = [...new Set([...window, ...packs.map((p) => p.month)])];
        const states = new Map<string, MonthStateWire>();
        for (let i = 0; i < months.length; i += BATCH) {
          const batch = months.slice(i, i + BATCH);
          const loaded = await Promise.all(batch.map(async (m) => [m, await api.getMonthState(m)] as const));
          if (!live) return;
          for (const [m, s] of loaded) states.set(m, s);
        }
        if (live) setData({ states, packs, tracker });
      } catch (e) {
        if (live) setError(errorMessage(e));
      }
    })();
    return () => { live = false; };
  }, [api]);

  const cur = currentMonthIST();
  const shown = data
    ? [...data.states.keys()]
        .filter((m) => m === cur || (data.states.get(m)?.invoices.length ?? 0) > 0 || data.packs.some((p) => p.month === m))
        .sort()
        .reverse()
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-3xl">Months</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data && !error && (
        <div aria-busy="true" className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      )}
      {data && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((m) => {
              const state = data.states.get(m)!;
              const stage = monthStage(state, data.packs.filter((p) => p.month === m));
              const n = state.invoices.length;
              const totals = sumMoney(state.invoices.flatMap((i) => (i.amount.value ? [i.amount.value] : [])));
              return (
                <li key={m}>
                  <Link href={hrefs.month(m)} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-accent-soft">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-lg font-extrabold">{monthLabel(m)}</span>
                      <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                    </span>
                    <span className="text-sm text-muted">{n === 0 ? "No invoices" : `${n} ${n === 1 ? "invoice" : "invoices"}`}</span>
                    {totals.length > 0 && <span className="font-bold">{totals.map(money).join(" · ")}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          {data.tracker && <TrackerView tracker={data.tracker} />}
        </>
      )}
    </div>
  );
}
