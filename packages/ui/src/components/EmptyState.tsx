import type { ReactNode } from "react";
import { IconBubble } from "./IconBubble";

/** A friendly "nothing here": an emoji, a title, a line of text, and an optional action. */
export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <IconBubble icon={icon} />
      <h2 className="text-xl">{title}</h2>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
