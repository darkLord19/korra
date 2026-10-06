import { FLAG_THRESHOLD } from "@korra/core";

export interface FieldData { value: unknown; confidence: number; source: "extracted" | "user" | "default" }
export type FieldKind = "text" | "date" | "money" | "country" | "decimal" | "receiptMode" | "bankId";

/** Presentation only: the backend's readiness check is what actually blocks a pack. */
export const needsCheck = (f: FieldData) => f.value !== null && f.confidence < FLAG_THRESHOLD && f.source !== "user";

export const RECEIPT_MODES = { local_transfer: "Local transfer", swift: "SWIFT" } as const;
