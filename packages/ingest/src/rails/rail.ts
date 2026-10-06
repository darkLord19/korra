import type { PaymentFacts, RailId } from "@korra/core";
import type { IngestResult } from "../types";
import { normHeader } from "../normalize";

/** Internal seam: one adapter per source of tabular payment data. */
export interface RailParser {
  rail: RailId;
  /** 0..1: how likely these headers are this rail's export. */
  detect(headers: string[]): number;
  parse(rows: Record<string, string>[]): {
    payments: Omit<PaymentFacts, "id">[];
    invoices: IngestResult["invoices"];
    warnings: string[];
  };
}

/** alias table: logical column -> accepted header spellings (any case/space/underscore). */
export type AliasTable<K extends string> = Record<K, readonly string[]>;

/** Maps logical columns to the actual header present in the file (first alias wins). */
export function resolveColumns<K extends string>(
  headers: string[],
  aliases: AliasTable<K>,
): Partial<Record<K, string>> {
  const byNorm = new Map<string, string>();
  for (const h of headers) if (!byNorm.has(normHeader(h))) byNorm.set(normHeader(h), h);
  const out: Partial<Record<K, string>> = {};
  for (const key of Object.keys(aliases) as K[]) {
    for (const alias of aliases[key]) {
      const hit = byNorm.get(normHeader(alias));
      if (hit !== undefined) {
        out[key] = hit;
        break;
      }
    }
  }
  return out;
}
