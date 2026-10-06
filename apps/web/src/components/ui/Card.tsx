import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)} {...rest} />;
}
export function CardHeader({ title, description, action, id }: { title: string; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 id={id} className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cx("px-5 py-4", className)} {...rest} />;
