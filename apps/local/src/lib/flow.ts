"use client";
import { useSyncExternalStore } from "react";
import { KEY_PREFIX } from "./data-safety";

export type FlowState = "new" | "started" | "tracking";

export const FLOW_KEY = `${KEY_PREFIX}flow`;
export const NUDGE_DISMISSED_KEY = `${KEY_PREFIX}flow.nudgeDismissed`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function parseFlow(raw: string | null | undefined): FlowState {
  if (raw === "started" || raw === "tracking") return raw;
  return "new";
}

export function getFlow(): FlowState {
  return parseFlow(safe(() => localStorage.getItem(FLOW_KEY), null));
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === FLOW_KEY || e.key === NUDGE_DISMISSED_KEY) notify();
  });
}

export function setFlow(flow: FlowState): void {
  safe(() => {
    if (flow === "new") {
      localStorage.removeItem(FLOW_KEY);
    } else {
      localStorage.setItem(FLOW_KEY, flow);
    }
  }, undefined);
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useFlow(): FlowState {
  return useSyncExternalStore(subscribe, getFlow, () => "new");
}

export function isNudgeDismissed(): boolean {
  return safe(() => localStorage.getItem(NUDGE_DISMISSED_KEY) === "true", false);
}

export function dismissNudge(): void {
  safe(() => {
    localStorage.setItem(NUDGE_DISMISSED_KEY, "true");
  }, undefined);
  notify();
}

export function useNudgeDismissed(): boolean {
  return useSyncExternalStore(subscribe, isNudgeDismissed, () => false);
}
