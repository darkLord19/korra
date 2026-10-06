"use client";

import { useState } from "react";

type Json = Record<string, unknown>;

/** Everything heavy is dynamically imported on click: the initial route stays small and prerender never touches WASM. */
export default function Page() {
  const [log, setLog] = useState<Json>({});
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    const t = performance.now();
    try {
      const res = await fn();
      setLog((l) => ({ ...l, [key]: { ms: Math.round(performance.now() - t), res } }));
    } catch (e) {
      setLog((l) => ({ ...l, [key]: { error: String(e instanceof Error ? e.stack ?? e.message : e) } }));
    } finally {
      setBusy(false);
    }
  };

  const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

  return (
    <main>
      <h1>Korra client-only spike</h1>
      <p>PGlite (idb://korra-spike) + backend use-cases + packs, all in this tab.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          data-testid="run"
          disabled={busy}
          onClick={() =>
            run("run", async () => {
              const m = await import("@/lib/spike");
              const r = await m.runFull();
              setPdf({ url: r.pdfUrl, name: r.pdfName });
              const p = await import("@/lib/pdftext");
              const txt = await p.extractText(r.pdfBytes);
              return { ...r.out, pdfjs: { pages: txt.pages, ms: txt.ms, sample: txt.text.slice(0, 120) } };
            })
          }
        >
          Run full flow
        </button>
        <button data-testid="read" disabled={busy} onClick={() => run("read", async () => (await import("@/lib/spike")).readPersisted())}>
          Read persisted (after reload)
        </button>
        <button
          data-testid="bank"
          disabled={busy}
          onClick={() => run("bank", async () => (await import("@/lib/spike")).saveNamedBank(`Bank ${Math.random().toString(36).slice(2, 6)}`))}
        >
          Save a bank
        </button>
        <button data-testid="backup" disabled={busy} onClick={() => run("backup", async () => (await import("@/lib/spike")).backupRoundTrip())}>
          Backup round trip
        </button>
      </div>
      {pdf && (
        <p>
          <a data-testid="pdf" href={pdf.url} download={pdf.name}>
            Download {pdf.name}
          </a>
        </p>
      )}
      <pre data-testid="out" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
        {JSON.stringify(log, replacer, 2)}
      </pre>
    </main>
  );
}
