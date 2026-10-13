"use client";
import { useState } from "react";
import type { AdBankWire } from "@korra/backend/schemas";
import { Badge, cx } from "../components";
import { needsCheck, type FieldData, type FieldKind } from "../lib/fields";
import { FieldEditor, displayField } from "./FieldEditor";

/** A field value with a "Check this" marker and click-to-edit. All rules live in the backend's editField. */
export function EditableCell({ entity, id, field, kind, data, banks, anchor, label, required = false, readOnly = false, showEdited = true, onChanged }: {
  entity: "invoice" | "payment"; id: string; field: string; kind: FieldKind; data: FieldData; banks: AdBankWire[];
  anchor?: string; label: string; required?: boolean; readOnly?: boolean;
  /** Mark a value the person has saved. Off where confirming a value ("Looks right") would tag every field. */
  showEdited?: boolean;
  /** Called after the value was saved. */
  onChanged?: (() => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const text = displayField(kind, data.value, banks);
  const flagged = needsCheck(data);
  const missing = required && data.value === null;

  if (readOnly) {
    return (
      <div id={anchor} className="flex flex-wrap items-center gap-2">
        <span className={cx(!text && "text-muted italic", (flagged || missing) && "rounded bg-flag-soft px-1 py-0.5")}>{text || "Not set"}</span>
        {flagged && <Badge tone="flag">Check this</Badge>}
        {showEdited && data.source === "user" && <span className="text-xs text-muted">edited</span>}
      </div>
    );
  }

  if (!editing) {
    return (
      <div id={anchor} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
          className={cx("rounded px-1 py-0.5 text-left hover:bg-accent-soft", !text && "text-muted italic", (flagged || missing) && "bg-flag-soft")}
        >
          {text || (required ? "Missing - add" : "Add")}
        </button>
        {flagged && <Badge tone="flag">Check this</Badge>}
        {showEdited && data.source === "user" && <span className="text-xs text-muted">edited</span>}
      </div>
    );
  }

  return (
    <FieldEditor
      entity={entity} id={id} field={field} kind={kind} data={data} banks={banks} label={label} anchor={anchor}
      onSaved={() => { setEditing(false); onChanged?.(); }}
      onCancel={() => setEditing(false)}
    />
  );
}
