import { describe, expect, it } from "vitest";
import { buildTrackerCsv, csvCell, majorString, TRACKER_CSV_HEADER, type TrackerCsvRow } from "./tracker-csv";

const usd = (minor: string) => ({ minor, currency: "USD" });
const row = (over: Partial<TrackerCsvRow> = {}): TrackerCsvRow => ({
  invoiceNo: "INV-2026-014",
  clientName: "Acme Corp",
  invoiceDate: "2026-09-28",
  amount: usd("123456"),
  realised: usd("123456"),
  outstanding: usd("0"),
  deadline: "2027-06-28",
  status: "realised",
  payments: [{ date: "2026-10-02", amount: usd("123456"), reference: "FIRA-9" }],
  ...over,
});
const parse = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);

describe("csvCell", () => {
  it("quotes cells with commas, quotes and line breaks (RFC 4180) and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("")).toBe("");
  });

  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@SUM(1)", "\tcmd", "\rcmd", "=HYPERLINK(\"http://x\",\"y\")"])("defuses the formula start of %j with a leading apostrophe", (v) => {
    const cell = csvCell(v);
    expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("does not touch values that merely contain those characters", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("INV-1")).toBe("INV-1");
    expect(csvCell("x@y.com")).toBe("x@y.com");
  });
});

describe("majorString", () => {
  it("is exact and uses the currency's minor exponent", () => {
    expect(majorString(usd("123456"))).toBe("1234.56");
    expect(majorString(usd("5"))).toBe("0.05");
    expect(majorString(usd("100"))).toBe("1.00");
    expect(majorString({ minor: "1234", currency: "JPY" })).toBe("1234");
    expect(majorString({ minor: "123456789012345678", currency: "USD" })).toBe("1234567890123456.78");
    expect(majorString(usd("-50"))).toBe("-0.50");
  });
});

describe("buildTrackerCsv", () => {
  it("golden: header, one row, CRLF, BOM", () => {
    expect(buildTrackerCsv([row()])).toBe(
      "\uFEFF" +
        "Invoice no.,Client,Invoice date,EDF month,Currency,Invoice amount,Realised amount,Outstanding amount,Realisation due date,Status,Matched payments\r\n" +
        "INV-2026-014,Acme Corp,2026-09-28,2026-09,USD,1234.56,1234.56,0.00,2027-06-28,Realised,2026-10-02 USD 1234.56 (ref FIRA-9)\r\n",
    );
    expect(parse(buildTrackerCsv([])).join("|")).toBe(TRACKER_CSV_HEADER.join(","));
  });

  it("several payments, no reference, no date, missing invoice number or client", () => {
    const csv = parse(
      buildTrackerCsv([
        row({
          invoiceNo: null,
          clientName: null,
          status: "partially_realised",
          realised: usd("40000"),
          outstanding: usd("83456"),
          payments: [{ date: "2026-10-02", amount: usd("10000"), reference: null }, { date: null, amount: usd("30000"), reference: "R,1" }],
        }),
      ]),
    );
    expect(csv[1]).toBe(',,2026-09-28,2026-09,USD,1234.56,400.00,834.56,2027-06-28,Partially realised,"2026-10-02 USD 100.00; undated USD 300.00 (ref R,1)"');
  });

  it("guards formula injection in every text cell, quoted or not", () => {
    const csv = parse(buildTrackerCsv([row({ invoiceNo: "=1+1", clientName: "-evil,Inc", payments: [{ date: "2026-10-02", amount: usd("1"), reference: "@x" }] })]));
    expect(csv[1]!.startsWith("'=1+1,\"'-evil,Inc\",")).toBe(true);
    expect(csv[1]).toContain("(ref @x)"); // the payments cell starts with a date, so the guard only matters at the start of a cell
  });

  it("an overdue row", () => {
    expect(parse(buildTrackerCsv([row({ status: "overdue", realised: usd("0"), outstanding: usd("123456"), payments: [] })]))[1]).toBe("INV-2026-014,Acme Corp,2026-09-28,2026-09,USD,1234.56,0.00,1234.56,2027-06-28,Overdue,");
  });
});
