import { cx } from "./cx";

/** A filename that truncates in the stem and keeps its extension visible, so "report.pdf" and "report.xlsx" stay apart on narrow screens. */
export function FileName({ name, className }: { name: string; className?: string }) {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 && name.length - dot <= 6 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  return (
    <span className={cx("flex min-w-0", className)} title={name}>
      <span className="truncate">{stem}</span>
      {ext && <span className="shrink-0">{ext}</span>}
    </span>
  );
}
