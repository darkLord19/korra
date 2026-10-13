"use client";
import type { ReactNode } from "react";
import { buttonClass, EmptyState } from "../components";
import { useNav } from "../context";
import { PackFlow } from "../flows/PackFlow";
import { ReviewFlow } from "../flows/ReviewFlow";
import { SetupFlow } from "../flows/SetupFlow";
import { UploadFlow } from "../flows/UploadFlow";
import type { FlowProps } from "../flows/types";
import type { Task } from "./tasks";

export type TaskFlowProps = FlowProps & {
  /** Shown on the celebration after a pack was marked sent (apps/local passes its backup nudge). */
  afterSubmit?: ReactNode;
  /** Renders the tasks the app adds itself (backup) and any kind this switch does not know. */
  renderExtraTask?: (task: Task, flow: FlowProps) => ReactNode;
};

/** The flow for a task, by kind. */
export function TaskFlow({ task, onDone, onClose, afterSubmit, renderExtraTask }: TaskFlowProps) {
  const { Link, hrefs } = useNav();
  const flow: FlowProps = { task, onDone, onClose };
  switch (task.kind) {
    case "setup": return <SetupFlow {...flow} />;
    case "upload": return <UploadFlow {...flow} />;
    case "review": return <ReviewFlow {...flow} />;
    case "generate":
    case "submit": return <PackFlow {...flow} {...(afterSubmit !== undefined ? { afterSubmit } : {})} />;
    case "realisation":
      return (
        <EmptyState icon="⏳" title={task.title} action={<Link href={task.month ? `${hrefs.month(task.month)}#inv-${task.invoiceId ?? ""}` : hrefs.months()} className={buttonClass("primary")}>Open the invoice</Link>}>
          {task.detail}
        </EmptyState>
      );
    default: {
      const extra = renderExtraTask?.(task, flow);
      if (extra !== undefined && extra !== null) return <>{extra}</>;
      return (
        <EmptyState icon={task.icon || "👍"} title={task.title || "Nothing to do here"} action={<Link href={hrefs.home()} className={buttonClass("secondary")}>Back to Home</Link>}>
          {task.detail}
        </EmptyState>
      );
    }
  }
}
