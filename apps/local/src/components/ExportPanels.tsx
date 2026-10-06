"use client";
// Settings slot: the two things Korra can hand to someone else. Both are copies made on this device, right now.
import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader } from "@korra/ui";
import { runCalendarExport, runCaExport } from "@/lib/exports";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function useAction<T>(run: () => Promise<T>, failure: string) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await run());
    } catch (e) {
      console.error("[korra] export failed", e);
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, error, start };
}

export function ExportPanels() {
  const calendar = useAction(() => runCalendarExport(), "The calendar could not be made. Try again.");
  const ca = useAction(() => runCaExport(), "The export could not be made. Try again.");
  return (
    <>
      <Card aria-labelledby="calendar-h">
        <CardHeader id="calendar-h" title="Calendar reminders" description="A calendar file with the EDF due date of each month, each unrealised invoice's realisation deadline, and alerts 60 and 30 days before it." />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">It lists invoice numbers and dates only: no amounts or client names. Re-download after your data changes — Korra has no server to update your calendar.</p>
          <Button disabled={calendar.busy} onClick={() => void calendar.start()}>{calendar.busy ? "Making the calendar..." : "Download calendar (.ics)"}</Button>
          {calendar.result && <Alert tone="success">Saved {calendar.result.filename} with {plural(calendar.result.events, "entry", "entries")}. Import it into your calendar app; importing it again later updates the same entries.</Alert>}
          {calendar.error && <Alert tone="danger">{calendar.error}</Alert>}
        </CardBody>
      </Card>

      <Card aria-labelledby="ca-export-h">
        <CardHeader id="ca-export-h" title="Export for my CA" description="A zip of your records to hand to your chartered accountant." />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            It holds every EDF pack you generated, a spreadsheet of the tracker, the calendar file and a short README. It is a copy of your records as they are now, not live sharing:
            your CA sees nothing that changes later, so export again when it does. It contains your invoices and client details, so send it only to people you trust.
          </p>
          <Button disabled={ca.busy} onClick={() => void ca.start()}>{ca.busy ? "Making the zip..." : "Export for my CA"}</Button>
          {ca.result && <Alert tone="success">Saved {ca.result.filename} with {plural(ca.result.packs, "pack")} and {plural(ca.result.invoices, "invoice")}.</Alert>}
          {ca.error && <Alert tone="danger">{ca.error}</Alert>}
        </CardBody>
      </Card>
    </>
  );
}
