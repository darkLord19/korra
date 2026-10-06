import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "neutral" | "ok" | "flag" | "danger" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-bg text-muted border-line",
  ok: "bg-ok-soft text-ok border-transparent",
  flag: "bg-flag-soft text-flag border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}
