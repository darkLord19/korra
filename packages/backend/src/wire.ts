import type { Wire } from "./wire-types";

/** bigint -> decimal string, Date -> ISO string, recursively. Output is JSON/RSC-safe. */
export function toWire<T>(value: T): Wire<T> {
  return walk(value) as Wire<T>;
}

function walk(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(walk);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  }
  return v;
}
