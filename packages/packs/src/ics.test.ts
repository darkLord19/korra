import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { REALISATION_THRESHOLDS, scheduleEvents, type ScheduleEvent } from "@korra/core";
import { buildCalendar, escapeText, foldLine } from "./ics";

const NOW = new Date("2026-10-06T10:34:56.789Z");
type Inv = { id: string; invoiceNo: string; deadline: string; status: "open" | "partially_realised" | "realised" | "overdue" };
const inv = (id: string, invoiceNo: string, deadline: string, status: Inv["status"] = "open"): Inv => ({ id, invoiceNo, deadline, status });
const build = (invoices: Inv[], months: string[] = [], today = "2026-10-06", now = NOW) => buildCalendar({ events: scheduleEvents({ months, invoices }, today), now });
const octets = (s: string) => new TextEncoder().encode(s).length;
/** Unfold (RFC 5545 3.1) and split into content lines. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "").split("\r\n");

describe("buildCalendar: golden output", () => {
  it("matches byte for byte (CRLF, DTSTAMP in UTC, all-day VALUE=DATE with exclusive end)", () => {
    expect(build([inv("11111111-2222-3333-4444-555555555555", "INV-2026-014", "2026-12-20")], ["2026-10"])).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Korra//Deadline calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Korra deadlines",
        "BEGIN:VEVENT",
        "UID:realisation_due-11111111-2222-3333-4444-555555555555-d60@korra.local",
        "DTSTAMP:20261006T103456Z",
        "DTSTART;VALUE=DATE:20261021",
        "DTEND;VALUE=DATE:20261022",
        "SUMMARY:60 days to realisation deadline: INV-2026-014",
        "DESCRIPTION:Korra reminder: invoice INV-2026-014 has not been fully realise",
        " d yet and its realisation deadline is in 60 days. Open Korra to check the ",
        " tracker.",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:realisation_due-11111111-2222-3333-4444-555555555555-d30@korra.local",
        "DTSTAMP:20261006T103456Z",
        "DTSTART;VALUE=DATE:20261120",
        "DTEND;VALUE=DATE:20261121",
        "SUMMARY:30 days to realisation deadline: INV-2026-014",
        "DESCRIPTION:Korra reminder: invoice INV-2026-014 has not been fully realise",
        " d yet and its realisation deadline is in 30 days. Open Korra to check the ",
        " tracker.",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:edf_due-2026-10@korra.local",
        "DTSTAMP:20261006T103456Z",
        "DTSTART;VALUE=DATE:20261130",
        "DTEND;VALUE=DATE:20261201",
        "SUMMARY:EDF due: October 2026 invoices",
        "DESCRIPTION:Korra reminder: the Export Declaration Form for invoices dated ",
        " October 2026 is due with your AD bank today. Open Korra to check the month",
        "  and download the pack.",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:realisation_deadline-11111111-2222-3333-4444-555555555555@korra.local",
        "DTSTAMP:20261006T103456Z",
        "DTSTART;VALUE=DATE:20261220",
        "DTEND;VALUE=DATE:20261221",
        "SUMMARY:Realisation deadline: INV-2026-014",
        "DESCRIPTION:Korra reminder: invoice INV-2026-014 must be realised (the expo",
        " rt payment received) by today. Open Korra to check the tracker.",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });
});

describe("line format", () => {
  const ics = build([inv("a", "INV-€₹–1", "2027-07-15"), inv("b", "N".repeat(200), "2027-08-15")], ["2026-10"]);

  it("every line ends CRLF (no bare LF or CR), including the last", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("no physical line exceeds 75 octets, and folds start with one space", () => {
    const lines = ics.split("\r\n").slice(0, -1);
    for (const l of lines) expect(octets(l), l).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
  });

  it("foldLine never splits a multi-byte character, and unfolding restores the text", () => {
    for (const filler of ["", "a", "ab", "abc"]) {
      const line = `SUMMARY:${filler}${"₹–€".repeat(40)}`;
      const folded = foldLine(line);
      for (const l of folded.split("\r\n")) {
        expect(octets(l)).toBeLessThanOrEqual(75);
        expect(l).not.toContain("\uFFFD");
      }
      expect(folded.replace(/\r\n /g, "")).toBe(line);
    }
    // A 3-octet character that would straddle octet 75 moves whole to the next line.
    const folded = foldLine(`${"x".repeat(73)}₹₹`).split("\r\n");
    expect(folded).toEqual([`${"x".repeat(73)}`, " ₹₹"]);
  });

  it("a short line is not folded", () => {
    expect(foldLine("X".repeat(75))).toBe("X".repeat(75));
    expect(foldLine("X".repeat(76))).toBe(`${"X".repeat(75)}\r\n X`);
  });
});

describe("text escaping", () => {
  it("escapes backslash first, then ; , and newlines", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
    expect(escapeText("bell\u0007 ok")).toBe("bell ok");
  });

  it("an invoice number with special characters stays one valid property", () => {
    const ics = build([inv("a", "A;B,C\\D\nE", "2027-07-15")]);
    const summary = unfold(ics).find((l) => l.startsWith("SUMMARY:Realisation"))!;
    expect(summary).toBe("SUMMARY:Realisation deadline: A\\;B\\,C\\\\D\\nE");
    const vevent = new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent").find((e) => (e.getFirstPropertyValue("summary") as string).startsWith("Realisation"))!;
    expect(vevent.getFirstPropertyValue("summary")).toBe("Realisation deadline: A;B,C\\D\nE");
  });
});

describe("stable identifiers", () => {
  const data = [inv("id-1", "INV-1", "2027-07-15"), inv("id-2", "INV-2", "2027-08-15", "partially_realised")];
  const uids = (ics: string) => unfold(ics).filter((l) => l.startsWith("UID:")).sort();

  it("two runs (different times) have the same UIDs, so a re-import updates instead of duplicating", () => {
    const a = build(data, ["2026-10", "2026-11"], "2026-10-06", new Date("2026-10-06T00:00:00Z"));
    const b = build(data, ["2026-10", "2026-11"], "2026-10-07", new Date("2026-10-07T12:00:00Z"));
    expect(uids(a)).toEqual(uids(b));
    expect(uids(a)).toHaveLength(2 + 3 * 2);
    expect(new Set(uids(a)).size).toBe(uids(a).length);
  });

  it("UIDs do not depend on the editable invoice number", () => {
    expect(uids(build([inv("id-1", "INV-1", "2027-07-15")]))).toEqual(uids(build([inv("id-1", "RENAMED", "2027-07-15")])));
  });

  it("the same input gives identical bytes", () => {
    expect(build(data, ["2026-10"])).toBe(build(data, ["2026-10"]));
  });
});

describe("which events, on which days", () => {
  const events = (ics: string) => new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents("vevent").map((e) => ({
    uid: e.getFirstPropertyValue("uid") as string,
    start: String(e.getFirstProperty("dtstart")!.getFirstValue()),
    summary: e.getFirstPropertyValue("summary") as string,
  }));

  it("a 9-month USD invoice and a 12-month INR invoice land on their deadlines, with 60 and 30 day alerts", () => {
    // Deadlines as `realisationOf` computes them: 2026-09-30 + 9 months, 2026-09-30 + 12 months.
    const ics = build([inv("usd", "USD-1", "2027-06-30"), inv("inr", "INR-1", "2027-09-30")], [], "2026-10-06");
    const byUid = Object.fromEntries(events(ics).map((e) => [e.uid, e.start]));
    expect(byUid["realisation_deadline-usd@korra.local"]).toBe("2027-06-30");
    expect(byUid["realisation_due-usd-d60@korra.local"]).toBe("2027-05-01");
    expect(byUid["realisation_due-usd-d30@korra.local"]).toBe("2027-05-31");
    expect(byUid["realisation_deadline-inr@korra.local"]).toBe("2027-09-30");
    expect(byUid["realisation_due-inr-d60@korra.local"]).toBe("2027-08-01");
    expect(byUid["realisation_due-inr-d30@korra.local"]).toBe("2027-08-31");
  });

  it("alert offsets are core's thresholds", () => {
    const evs: ScheduleEvent[] = scheduleEvents({ months: [], invoices: [inv("x", "X", "2027-06-30")] }, "2026-10-06");
    expect(evs.filter((e) => e.kind === "realisation_alert").map((e) => e.daysBefore)).toEqual([...REALISATION_THRESHOLDS]);
  });

  it("each month gets its EDF due date: last day of the month + 30 days", () => {
    const ics = build([], ["2026-10", "2027-01"]);
    expect(events(ics).map((e) => [e.uid, e.start])).toEqual([
      ["edf_due-2026-10@korra.local", "2026-11-30"],
      ["edf_due-2027-01@korra.local", "2027-03-02"],
    ]);
  });

  it("is all-day: DTSTART/DTEND are DATE values with no time and no TZID", () => {
    const lines = unfold(build([inv("a", "A", "2027-07-15")], ["2026-10"]));
    for (const l of lines.filter((x) => /^DT(START|END)/.test(x))) expect(l).toMatch(/^DT(START|END);VALUE=DATE:\d{8}$/);
    expect(lines.filter((l) => l.startsWith("DTSTAMP:")).every((l) => /^DTSTAMP:\d{8}T\d{6}Z$/.test(l))).toBe(true);
    expect(lines.join("\n")).not.toMatch(/TZID|VTIMEZONE/);
  });

  it("realised invoices produce no events", () => {
    expect(events(build([inv("a", "A", "2027-07-15", "realised")]))).toEqual([]);
  });
});

describe("no personal data", () => {
  it("only invoice numbers, months and deadline labels: no client, amount, PAN or exporter name", () => {
    // The input type has no room for those; this guards the rendered text too.
    const ics = build([inv("a", "INV-2026-014", "2027-07-15")], ["2026-10"]);
    for (const secret of ["Acme", "ABCDE1234F", "29ABCDE1234F1Z5", "Jane", "USD", "INR", "250"]) expect(ics).not.toContain(secret);
    expect(ics).not.toMatch(/\d+\.\d{2}/); // no amounts
    expect(unfold(ics).find((l) => l.startsWith("X-WR-CALNAME"))).toBe("X-WR-CALNAME:Korra deadlines");
  });
});

describe("time zones", () => {
  it("dates are plain strings: the same calendar, whatever TZ the machine runs in", () => {
    const here = process.env.TZ ?? "(system)";
    const ics = build([inv("a", "A", "2027-06-30")], ["2026-10"], "2026-10-06", new Date("2026-10-05T20:00:00Z")); // 01:30 IST on the 6th
    const days = unfold(ics).filter((l) => l.startsWith("DTSTART")).map((l) => l.slice(-8));
    expect(days, `TZ=${here}`).toEqual(["20261130", "20270501", "20270531", "20270630"]);
    expect(unfold(ics).find((l) => l.startsWith("DTSTAMP:")), `TZ=${here}`).toBe("DTSTAMP:20261005T200000Z");
  });
});

describe("RFC 5545 parser", () => {
  it("ical.js parses the file and sees the expected structure", () => {
    const ics = build([inv("a", "INV-€₹–1", "2027-07-15"), inv("b", "N".repeat(150), "2027-08-15")], ["2026-10"]);
    const root = new ICAL.Component(ICAL.parse(ics));
    expect(root.name).toBe("vcalendar");
    expect(root.getFirstPropertyValue("version")).toBe("2.0");
    expect(root.getFirstPropertyValue("prodid")).toBe("-//Korra//Deadline calendar//EN");
    expect(root.getFirstPropertyValue("x-wr-calname")).toBe("Korra deadlines");
    const evs = root.getAllSubcomponents("vevent");
    expect(evs).toHaveLength(1 + 2 * 3);
    for (const e of evs) {
      expect(e.getFirstProperty("dtstart")!.type).toBe("date");
      expect(e.getFirstPropertyValue("dtstamp")!.toString()).toBe("2026-10-06T10:34:56Z");
    }
    expect(evs.map((e) => e.getFirstPropertyValue("summary") as string)).toContain("Realisation deadline: INV-€₹–1");
  });
});
