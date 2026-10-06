import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "info" | "warning" | "danger" | "success";
const tones: Record<Tone, string> = {
  info: "border-line bg-accent-soft text-ink",
  warning: "border-flag/40 bg-flag-soft text-ink",
  danger: "border-danger/40 bg-danger-soft text-ink",
  success: "border-ok/40 bg-ok-soft text-ink",
};
export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}
