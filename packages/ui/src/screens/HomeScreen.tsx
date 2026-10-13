"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { edfDueDate } from "@korra/core";
import type { MonthStateWire, OnboardingWire, PackWire, TrackerWire } from "@korra/backend/schemas";
import { Alert, Badge, Button, buttonClass, cx, EmptyState, IconBubble, Skeleton } from "../components";
import { useApi, useNav, type KorraNav } from "../context";
import { errorMessage } from "../errors";
import type { FlowProps } from "../flows/types";
import { TaskFlow } from "../home/TaskFlow";
import { deriveTasks, findTask, taskFromId, type Task } from "../home/tasks";
import { dateLabel, monthLabel, shiftMonth, todayIST } from "../lib/format";
import { usePoll } from "../lib/use-poll";

interface HomeData {
  onboarding: OnboardingWire;
  months: { month: string; state: MonthStateWire }[];
  packs: PackWire[];
  tracker: TrackerWire | null;
}

const POLL_MS = 3000;
const TOAST_MS = 4500;
const CHIP: Record<Task["urgency"], { tone: "danger" | "flag" | "neutral"; label: string }> = {
  urgent: { tone: "danger", label: "Urgent" },
  soon: { tone: "flag", label: "Due soon" },
  fyi: { tone: "neutral", label: "FYI" },
};

/** Where a task's row or hero card goes: the flow, or (for the few that live elsewhere) settings or the invoice on its month page. */
function taskHref(task: Task, hrefs: KorraNav["hrefs"]): string {
  if (task.href === "settings") return hrefs.settings();
  if (task.kind === "realisation") return task.month ? `${hrefs.month(task.month)}#inv-${task.invoiceId ?? ""}` : hrefs.months();
  return hrefs.task(task.id);
}

async function loadHome(api: ReturnType<typeof useApi>, today: string): Promise<HomeData> {
  const cur = today.slice(0, 7);
  const [onboarding, packs, tracker] = await Promise.all([api.getOnboarding(), api.listPacks(), api.getTracker().catch(() => null)]);
  const months = onboarding.complete
    ? await Promise.all([cur, shiftMonth(cur, -1)].map(async (month) => ({ month, state: await api.getMonthState(month) })))
    : [];
  return { onboarding, months, packs, tracker };
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-44 rounded-3xl" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

function HeroCard({ task }: { task: Task }) {
  const { Link, hrefs } = useNav();
  const open = task.kind === "realisation" || task.href === "settings";
  return (
    <div className="hero-gradient animate-pop-in rounded-3xl p-6 text-white shadow-lg">
      <p className="text-sm font-semibold text-white/85">{task.detail}</p>
      <h2 className="mt-1 text-2xl font-extrabold leading-tight text-white">{task.title}</h2>
      <Link href={taskHref(task, hrefs)} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-7 text-base font-extrabold text-[#5846d6] hover:bg-white/90">
        {open ? "Open" : "Let's go"}
      </Link>
    </div>
  );
}

function TaskRow({ task, selected }: { task: Task; selected: boolean }) {
  const { Link, hrefs } = useNav();
  const chip = CHIP[task.urgency];
  return (
    <li>
      <Link
        href={taskHref(task, hrefs)}
        {...(selected ? { "aria-current": "true" as const } : {})}
        className={cx("flex min-h-16 items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-accent-soft", selected ? "border-accent bg-accent-soft" : "border-line bg-surface")}
      >
        <IconBubble icon={task.icon} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-snug">{task.title}</span>
          <span className="block truncate text-sm text-muted">{task.detail}</span>
        </span>
        <Badge tone={chip.tone}>{chip.label}</Badge>
      </Link>
    </li>
  );
}

function AllCaughtUp({ today }: { today: string }) {
  const { Link, hrefs } = useNav();
  const cur = today.slice(0, 7);
  return (
    <EmptyState
      icon="🎉"
      title="Nothing to do right now"
      action={<Link href={hrefs.task(`upload:${cur}`)} className={buttonClass("primary", "lg")}>Add invoices</Link>}
    >
      Next up: {monthLabel(cur).split(" ")[0]} invoices, EDF due {dateLabel(edfDueDate(cur))}.
    </EmptyState>
  );
}

/**
 * The to-do list. Shows the one next thing as a hero card, the rest as rows, and the flow for `taskId` (the app's
 * `?task=` param) beside the list on desktop or instead of it on a phone. `onSelectTask` is how the app changes the
 * URL; by default that is `nav.push`.
 */
export function HomeScreen({ taskId, onSelectTask, extraTasks, renderExtraTask, afterSubmit, today: todayProp }: {
  taskId: string | null;
  onSelectTask?: (id: string | null) => void;
  /** Tasks the app adds (apps/local adds its backup task). */
  extraTasks?: Task[];
  /** Renders the flow of a task this screen does not know (the app's extra tasks). */
  renderExtraTask?: (task: Task, flow: FlowProps) => ReactNode;
  /** Shown on the celebration after a pack was marked sent. */
  afterSubmit?: ReactNode;
  /** YYYY-MM-DD in India. Defaults to today. */
  today?: string;
}) {
  const api = useApi();
  const nav = useNav();
  const { Link, hrefs } = nav;
  const today = todayProp ?? todayIST();
  const select = onSelectTask ?? ((id: string | null) => nav.push(id ? hrefs.task(id) : hrefs.home()));

  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async (): Promise<HomeData | null> => {
    const mine = ++seq.current;
    try {
      const next = await loadHome(api, today);
      if (mine !== seq.current) return null;
      setData(next);
      setError(null);
      return next;
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
      return null;
    }
  }, [api, today]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const reading = !!data?.months.some((m) => m.state.documents.some((d) => d.status === "uploaded" || d.status === "ingesting"));
  usePoll(reading, () => void refresh(), POLL_MS);

  const derive = useCallback((d: HomeData) => deriveTasks({ ...d, today }, extraTasks), [today, extraTasks]);
  const tasks = useMemo(() => (data ? derive(data) : null), [data, derive]);

  const selected: Task | null = taskId === null ? null : (tasks ? findTask(tasks, taskId) : null) ?? taskFromId(taskId);
  const waiting = taskId !== null && selected === null && !tasks && !error;
  const total = tasks ? (tasks.hero ? 1 : 0) + tasks.rest.length : 0;

  async function handleDone(next?: string) {
    const fresh = (await refresh()) ?? data;
    const after = fresh ? derive(fresh) : null;
    const candidate = next ?? (after ? [after.hero, ...after.rest].find((t) => t && t.id !== taskId)?.id : undefined) ?? null;
    const found = candidate && after ? findTask(after, candidate) : null;
    if (found) setToast(`Nice! Next up: ${found.title}`);
    select(candidate);
  }

  const firstName = data?.onboarding.profile?.legalName?.trim().split(/\s+/)[0];
  const setupFirst = tasks?.hero?.kind === "setup";
  const headline = setupFirst ? "Let's get you set up" : total === 0 ? "You're all caught up 🎉" : `${total} ${total === 1 ? "thing needs" : "things need"} you`;
  const twoPane = taskId !== null || !!tasks?.hero;

  const list = (
    <div className={cx("space-y-6", taskId !== null && "hidden lg:block")}>
      {!tasks ? (
        error ? <Alert tone="danger">{error}</Alert> : <ListSkeleton />
      ) : (
        <>
          <div>
            <p className="text-sm font-bold text-muted">Hey 👋{firstName ? ` ${firstName}` : ""}</p>
            <h1 className="mt-1 text-3xl">{headline}</h1>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          {tasks.hero && <HeroCard task={tasks.hero} />}
          {tasks.rest.length > 0 && (
            <ul aria-label="More to do" className="space-y-2">
              {tasks.rest.map((t) => <TaskRow key={t.id} task={t} selected={t.id === taskId} />)}
            </ul>
          )}
          {total === 0 && <AllCaughtUp today={today} />}
          {tasks.done.length > 0 && (
            <section aria-labelledby="done-h">
              <h2 id="done-h" className="mb-2 text-sm font-bold text-muted">Recently done</h2>
              <ul className="space-y-1">
                {tasks.done.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm text-muted">
                    <span aria-hidden="true">{d.icon}</span>
                    {d.title}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );

  let pane: ReactNode;
  if (taskId !== null) {
    if (selected) {
      pane = <TaskFlow key={selected.id} task={selected} onDone={(next) => void handleDone(next)} onClose={() => select(null)} {...(afterSubmit !== undefined ? { afterSubmit } : {})} {...(renderExtraTask ? { renderExtraTask } : {})} />;
    } else if (waiting) {
      pane = <div aria-busy="true" className="mx-auto max-w-xl space-y-4"><Skeleton className="h-10" /><Skeleton className="h-48" /></div>;
    } else if (error && !tasks) {
      pane = <Alert tone="danger">{error}</Alert>;
    } else {
      pane = <EmptyState icon="✅" title="That's already done ✓" action={<Link href={hrefs.home()} className={buttonClass("primary")}>Back to Home</Link>}>Nothing more to do here.</EmptyState>;
    }
  } else if (tasks?.hero) {
    const hero = tasks.hero;
    pane = (
      <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl bg-surface-soft p-8 text-center">
        <IconBubble icon={hero.icon} />
        <p className="text-xl font-extrabold">Start with: {hero.title}</p>
        <p className="text-sm text-muted">{hero.detail}</p>
        {hero.kind === "realisation" || hero.href === "settings"
          ? <Link href={taskHref(hero, hrefs)} className={buttonClass("primary", "lg")}>Open</Link>
          : <Button size="lg" onClick={() => select(hero.id)}>Let's go</Button>}
      </div>
    );
  }

  return (
    <>
      <div className={cx("mx-auto", twoPane ? "lg:grid lg:grid-cols-[380px_1fr] lg:items-start lg:gap-10" : "max-w-xl")}>
        {list}
        {twoPane && <div className={cx("min-w-0", taskId === null && "hidden lg:block")}>{pane}</div>}
      </div>
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm md:bottom-6">
        {toast && <p className="animate-pop-in rounded-full bg-ink px-5 py-3 text-center text-sm font-bold text-bg shadow-lg">{toast}</p>}
      </div>
    </>
  );
}
