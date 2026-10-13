"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { edfDueDate } from "@korra/core";
import type { MonthStateWire, OnboardingWire, PackWire, TrackerWire } from "@korra/backend/schemas";
import { Alert, Badge, buttonClass, cx, EmptyState, IconBubble, Skeleton } from "../components";
import { useApi, useNav, type KorraNav } from "../context";
import { errorMessage } from "../errors";
import type { FlowProps } from "../flows/types";
import { TaskFlow } from "../home/TaskFlow";
import { deriveTasks, findTask, taskFromId, type Task } from "../home/tasks";
import { dateLabel, greetingName, monthLabel, shiftMonth, todayIST } from "../lib/format";
import { useMediaQuery } from "../lib/use-media";
import { usePoll } from "../lib/use-poll";

interface HomeData {
  onboarding: OnboardingWire;
  months: { month: string; state: MonthStateWire }[];
  packs: PackWire[];
  tracker: TrackerWire | null;
}

const POLL_MS = 3000;
const TOAST_MS = 4000;
/** `lg`: where the list and a flow sit side by side. */
const WIDE = "(min-width: 1024px)";
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

/** The next thing to do. `selected` (its flow is open beside the list) is a ring, never a lowered opacity. */
function HeroCard({ task, selected }: { task: Task; selected: boolean }) {
  const { Link, hrefs } = useNav();
  const open = task.kind === "realisation" || task.href === "settings";
  return (
    <div {...(selected ? { "aria-current": "true" as const } : {})} className={cx("hero-gradient rounded-3xl p-6 text-white shadow-lg", selected && "ring-4 ring-accent/30")}>
      <p className="text-sm font-semibold text-white">{task.detail}</p>
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
 * `?task=` param) beside the list on desktop or instead of it on a phone. With no `taskId`, desktop (`lg`) opens the
 * hero task's flow in that pane anyway (the URL stays `/home`); a phone shows the list only. `onSelectTask` is how the
 * app changes the URL; by default that is `nav.push`.
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
  // The task whose flow is on screen. A task can drop out of the list while its flow is still showing (a backup that
  // was just taken, a review whose last card was answered): the flow stays until it calls onDone or onClose, and
  // "That's already done" is only for a task that was never on screen in this visit.
  const shown = useRef<Task | null>(null);
  const seq = useRef(0);
  const wide = useMediaQuery(WIDE);
  // The hero whose flow shows beside the list when there is no `?task=`. It is pinned once shown: finishing a step (a
  // saved profile, an uploaded invoice) changes which task is the hero, and the flow in front of the person must not
  // be swapped out under them. It unpins when the flow is done or a task is chosen.
  const [pinned, setPinned] = useState<string | null>(null);

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

  // A hero that lives elsewhere (Settings) has no flow here: it stays a card with an Open link.
  const heroId = tasks?.hero && tasks.hero.href !== "settings" ? tasks.hero.id : null;
  useEffect(() => { setPinned(taskId === null ? (prev) => prev ?? heroId : null); }, [taskId, heroId]);
  const previewId = wide && taskId === null ? pinned ?? heroId : null;
  const activeId = taskId ?? previewId;

  const known: Task | null = activeId === null ? null : (tasks ? findTask(tasks, activeId) : null) ?? taskFromId(activeId);
  const selected: Task | null = known ?? (activeId !== null && shown.current?.id === activeId ? shown.current : null);
  useEffect(() => { shown.current = selected; });
  const waiting = taskId !== null && selected === null && !tasks && !error;
  const total = tasks ? (tasks.hero ? 1 : 0) + tasks.rest.length : 0;

  async function handleDone(next?: string) {
    const fresh = (await refresh()) ?? data;
    const after = fresh ? derive(fresh) : null;
    const candidate = next ?? (after ? [after.hero, ...after.rest].find((t) => t && t.id !== activeId)?.id : undefined) ?? null;
    const found = candidate && after ? findTask(after, candidate) : null;
    if (found) setToast(`Nice! Next up: ${found.title}`);
    setPinned(null);
    select(candidate);
  }

  const firstName = greetingName(data?.onboarding.profile?.legalName);
  const setupFirst = tasks?.hero?.kind === "setup";
  const headline = setupFirst ? "Let's get you set up" : total === 0 ? "You're all caught up 🎉" : `${total} ${total === 1 ? "thing needs" : "things need"} you`;
  const twoPane = taskId !== null || previewId !== null;

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
          {tasks.hero && <HeroCard task={tasks.hero} selected={tasks.hero.id === activeId} />}
          {tasks.rest.length > 0 && (
            <ul aria-label="More to do" className="space-y-2">
              {tasks.rest.map((t) => <TaskRow key={t.id} task={t} selected={t.id === activeId} />)}
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
  if (taskId !== null || previewId !== null) {
    if (selected) {
      pane = <TaskFlow key={selected.id} task={selected} onDone={(next) => void handleDone(next)} onClose={() => select(null)} {...(afterSubmit !== undefined ? { afterSubmit } : {})} {...(renderExtraTask ? { renderExtraTask } : {})} />;
    } else if (waiting) {
      pane = <div aria-busy="true" className="mx-auto max-w-xl space-y-4"><Skeleton className="h-10" /><Skeleton className="h-48" /></div>;
    } else if (error && !tasks) {
      pane = <Alert tone="danger">{error}</Alert>;
    } else {
      pane = <EmptyState icon="✅" title="That's already done ✓" action={<Link href={hrefs.home()} className={buttonClass("primary")}>Back to Home</Link>}>Nothing more to do here.</EmptyState>;
    }
  }

  return (
    <>
      <div className={cx("mx-auto", twoPane ? "lg:grid lg:grid-cols-[380px_1fr] lg:items-start lg:gap-10" : "max-w-xl")}>
        {list}
        {twoPane && <div className={cx("min-w-0", taskId === null && "hidden lg:block", taskId === null && "[&_[data-flow-close]]:hidden")}>{pane}</div>}
      </div>
      {/* At the top, under the bar: below `lg` the bottom edge is taken by the flow's sticky action bar (and the tab bar). */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-[4.75rem] z-40 mx-auto max-w-sm lg:top-auto lg:bottom-6">
        {toast && <p className="animate-pop-in rounded-full bg-ink px-5 py-3 text-center text-sm font-bold text-bg shadow-lg">{toast}</p>}
      </div>
    </>
  );
}
