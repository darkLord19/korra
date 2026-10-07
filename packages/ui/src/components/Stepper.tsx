import { cx } from "./cx";

const STEPS = [
  { label: "Set up", hint: "Your details and bank, once." },
  { label: "Upload invoices", hint: "Add invoices, confirm what Korra read." },
  { label: "Download your EDF pack", hint: "Download, submit to your bank, record it." },
] as const;

const Check = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

/** The first-run EDF flow's progress: three steps, `current` is 1-based. Opt-in; screens take it as a `step` node. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div>
      <ol aria-label="Progress" className="grid grid-cols-3 gap-x-3">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          const here = n === current;
          return (
            <li key={s.label} {...(here ? { "aria-current": "step" as const } : {})} className={cx("border-t-2 pt-3", done || here ? "border-accent" : "border-line")}>
              <div className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    done ? "border-accent bg-accent text-accent-ink" : here ? "border-accent bg-accent text-accent-ink ring-2 ring-accent/25" : "border-line text-muted",
                  )}
                >
                  {done ? <Check /> : n}
                </span>
                <span className={cx("min-w-0 text-xs font-medium leading-5 sm:text-sm", here ? "text-ink" : done ? "text-ink" : "text-muted")}>
                  {s.label}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </div>
              <p className="mt-1 hidden pl-7 text-xs text-muted sm:block">{s.hint}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted sm:hidden">{STEPS[current - 1]!.hint}</p>
    </div>
  );
}
