"use client";
import type { ReactNode } from "react";
import { Button, ProgressDots } from "../components";

export interface FlowAction { label: string; onClick?: () => void; type?: "button" | "submit"; form?: string; disabled?: boolean; pending?: boolean }

/**
 * The chrome of a guided flow: a header (close button, title, progress dots), a body, and an action bar.
 *
 * Action bar placement: below `lg` it is sticky at the bottom of the viewport, with safe-area padding. Below `md`
 * AppShell shows a fixed bottom tab bar (3.5rem tall plus the safe area), so the bar is offset above it
 * (`bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`); from `md` there is no tab bar and it sits at `bottom-0`.
 * At `lg` and up it is inline at the end of the pane. The primary action is full width on phones. Keep a flow's whole
 * body (celebration cards, notes) inside `children`: anything rendered after the frame sits under the bar.
 */
export function FlowFrame({ title, step, onClose, primary, secondary, children }: {
  title: string;
  step?: { index: number; total: number } | undefined;
  onClose: () => void;
  primary?: FlowAction | undefined;
  secondary?: { label: string; onClick: () => void } | undefined;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="flow-title" className="mx-auto flex w-full max-w-xl flex-col">
      {/* Below `md` the dots take their own line under the title (which may wrap); from `md` they share its row. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-4 md:flex-nowrap">
        <button type="button" onClick={onClose} aria-label="Close" data-flow-close className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-accent-soft">
          <span aria-hidden="true">✕</span>
        </button>
        <h1 id="flow-title" className="min-w-0 flex-1 text-xl">{title}</h1>
        {step && <div className="basis-full pl-14 md:basis-auto md:pl-0"><ProgressDots index={step.index} total={step.total} /></div>}
      </header>
      <div className="min-w-0 flex-1 space-y-4 pb-6">{children}</div>
      {(primary || secondary) && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pb-3 pt-3 md:bottom-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:flex-row-reverse lg:items-center lg:justify-start lg:gap-3 lg:border-t-0 lg:bg-transparent lg:px-0">
          {primary && (
            <Button
              size="lg"
              type={primary.type ?? "button"}
              {...(primary.form ? { form: primary.form } : {})}
              {...(primary.onClick ? { onClick: primary.onClick } : {})}
              disabled={primary.disabled || primary.pending}
              aria-busy={primary.pending || undefined}
              className="w-full lg:w-auto"
            >
              {primary.label}
            </Button>
          )}
          {secondary && (
            <button type="button" onClick={secondary.onClick} className="min-h-11 rounded-full px-4 text-sm font-bold text-accent hover:bg-accent-soft">
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
