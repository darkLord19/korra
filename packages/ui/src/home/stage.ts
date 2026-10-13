import type { MonthStateWire, PackWire } from "@korra/backend/schemas";
import { reviewBlockers } from "./tasks";

export type Stage = "nothing" | "check" | "ready" | "not_sent" | "sent";

export const STAGE_LABEL: Record<Stage, string> = {
  nothing: "Nothing yet",
  check: "To check",
  ready: "Ready to make",
  not_sent: "Not sent",
  sent: "Sent ✓",
};

export const STAGE_TONE: Record<Stage, "neutral" | "flag" | "accent" | "ok"> = {
  nothing: "neutral",
  check: "flag",
  ready: "accent",
  not_sent: "accent",
  sent: "ok",
};

/** Blockers other than "no invoices for this bank" (every bank without invoices repeats that one). */
const realBlockers = (state: MonthStateWire) => state.blockersByBank.some((b) => b.blockers.some((x) => x.kind !== "no_invoices"));

/**
 * Where a month stands. `packs` are that month's packs. A pack settles it (sent when every pack was marked sent,
 * otherwise not sent); with no pack, no invoices is "nothing yet", any blocker is "to check", and the rest is "ready".
 */
export function monthStage(state: MonthStateWire, packs: PackWire[]): Stage {
  if (packs.length > 0) return packs.every((p) => p.status === "submitted") ? "sent" : "not_sent";
  if (state.invoices.length === 0) return "nothing";
  return realBlockers(state) ? "check" : "ready";
}

export type NextStep = { label: string; to: { task: string } | { settings: true } };

/** The one thing to do next for a month, or null when there is nothing (sent, or waiting on files being read). */
export function monthNextStep(month: string, state: MonthStateWire, packs: PackWire[]): NextStep | null {
  const stage = monthStage(state, packs);
  switch (stage) {
    case "nothing": return { label: "Add invoices", to: { task: `upload:${month}` } };
    case "check": {
      const n = reviewBlockers(state).length;
      if (n > 0) return { label: `Check ${n} ${n === 1 ? "thing" : "things"}`, to: { task: `review:${month}` } };
      const profile = state.blockersByBank.some((b) => b.blockers.some((x) => x.kind === "missing_field" && x.entity === "exporter"));
      return profile ? { label: "Finish your details", to: { settings: true } } : null;
    }
    case "ready": {
      const bank = state.blockersByBank.find((b) => b.blockers.length === 0 && !packs.some((p) => p.adBankId === b.adBankId));
      return bank ? { label: "Make my pack", to: { task: `generate:${month}:${bank.adBankId}` } } : null;
    }
    case "not_sent": {
      const pack = packs.find((p) => p.status !== "submitted");
      return pack ? { label: "Send your pack", to: { task: `submit:${pack.id}` } } : null;
    }
    case "sent": return null;
  }
}
