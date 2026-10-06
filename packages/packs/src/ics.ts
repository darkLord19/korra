import type { IsoDate, ScheduleEvent } from "@korra/core";
import { monthLabel, stripControls } from "./util";

/** The calendar's name in the person's calendar app. Deliberately generic: no name, no identifiers. */
export const CALENDAR_NAME = "Korra deadlines";
export const CALENDAR_PRODID = "-//Korra//Deadline calendar//EN";
/** Domain half of every UID. Not a real mailbox; it only has to be stable and unlikely to clash. */
const UID_DOMAIN = "korra.local";

const CRLF = "\r\n";
const MAX_OCTETS = 75;
const enc = new TextEncoder();

/**
 * RFC 5545 TEXT escaping: backslash first, then semicolon and comma, and line breaks as \n. Other control characters
 * are dropped (they cannot appear in a content line).
 */
export function escapeText(s: string): string {
  return stripControls(s, true)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 line folding: no line longer than 75 octets (UTF-8, CRLF not counted); a break is a CRLF followed by one
 * space, which counts toward the next line's 75. Never splits a multi-byte character.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (octets + n > limit) {
      out.push(current);
      current = " ";
      octets = 1;
      limit = MAX_OCTETS;
    }
    current += ch;
    octets += n;
  }
  out.push(current);
  return out.join(CRLF);
}

const compactDate = (d: IsoDate): string => d.replaceAll("-", "");
/** `2026-10-06T10:34:00.123Z` -> `20261006T103400Z` (UTC, which is what DTSTAMP must be). */
const utcStamp = (now: Date): string => now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/**
 * The words of one entry. Only an invoice number or a month and a deadline label: never an amount, a client, a
 * name or a PAN, so the file stays harmless if it is shared.
 */
function textOf(e: ScheduleEvent): { summary: string; description: string } {
  if (e.kind === "edf_due") {
    const month = monthLabel(e.month ?? "");
    return {
      summary: `EDF due: ${month} invoices`,
      description: `Korra reminder: the Export Declaration Form for invoices dated ${month} is due with your AD bank today. Open Korra to check the month and download the pack.`,
    };
  }
  const no = e.invoiceNo ?? "";
  if (e.kind === "realisation_deadline") {
    return {
      summary: `Realisation deadline: ${no}`,
      description: `Korra reminder: invoice ${no} must be realised (the export payment received) by today. Open Korra to check the tracker.`,
    };
  }
  return {
    summary: `${e.daysBefore} days to realisation deadline: ${no}`,
    description: `Korra reminder: invoice ${no} has not been fully realised yet and its realisation deadline is in ${e.daysBefore} days. Open Korra to check the tracker.`,
  };
}

/** `edf_due:2026-10` -> `edf_due-2026-10@korra.local`. Stable: built from the event's own id, never from editable text. */
const uidOf = (e: ScheduleEvent): string => `${e.uid.replace(/[^A-Za-z0-9_-]+/g, "-")}@${UID_DOMAIN}`;

export interface CalendarInput {
  events: ScheduleEvent[];
  /** When the file is made (DTSTAMP). Injected so the output is reproducible. */
  now: Date;
}

/**
 * An RFC 5545 calendar (`.ics`) of all-day events. Re-importing a newer export updates the entries (same UIDs)
 * instead of duplicating them. CRLF line endings, folded at 75 octets, no time zones (all-day dates are floating).
 */
export function buildCalendar({ events, now }: CalendarInput): string {
  const stamp = utcStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${CALENDAR_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
  ];
  for (const e of events) {
    const { summary, description } = textOf(e);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidOf(e)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(e.endDate)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
