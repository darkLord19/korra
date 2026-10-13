import { describe, expect, it } from "vitest";
import { buildMailtoUrl, parseMailto } from "./mailto";

const base = {
  contactEmail: "rm@bank.in",
  packMonth: "2026-09",
  bankName: "Acme Bank",
  adCode: "6390001",
  summary: { invoiceCount: 2, totals: [{ minor: "150000", currency: "USD" }], exporterName: "Jane Dev", signatoryName: "Jane Dev" },
  files: [{ name: "EDF-acme-2026-09.pdf" }, { name: "supporting-2026-09.zip" }],
};

describe("buildMailtoUrl", () => {
  it("addresses the bank, with a subject naming the month, bank and AD code, and a body listing the files", () => {
    const url = buildMailtoUrl(base);
    expect(url.startsWith("mailto:rm@bank.in?")).toBe(true);
    const { subject, body } = parseMailto(url);
    expect(subject).toBe("EDF Submission - September 2026 - Acme Bank (AD Code: 6390001)");
    expect(body).toContain("- EDF-acme-2026-09.pdf");
    expect(body).toContain("- supporting-2026-09.zip");
    expect(body).toContain("Invoices: 2");
    expect(body.trim().endsWith("Jane Dev")).toBe(true);
  });

  it("uses the subject and intro it is given, and a dash for a missing AD code", () => {
    const { subject, body } = parseMailto(buildMailtoUrl({ ...base, adCode: "", subject: "Custom subject", intro: "Hello there." }));
    expect(subject).toBe("Custom subject");
    expect(body.startsWith("Hello there.")).toBe(true);
    expect(body).toContain("AD Code: —");
  });

  it("encodes spaces as %20, not +", () => {
    expect(buildMailtoUrl(base)).not.toContain("+");
    expect(buildMailtoUrl(base)).toContain("EDF%20Submission");
  });
});
