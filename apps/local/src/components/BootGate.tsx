"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button } from "@korra/ui";
import { boot } from "@/lib/boot";
import { LocalProviders } from "@/lib/nav";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; api: Awaited<ReturnType<typeof boot>>["api"] };

/**
 * Opens the local database on first use and renders the screens inside the local `KorraApi` provider.
 * The server render and the first client render are both the loading state (the boot runs from an effect), so
 * hydration always matches.
 */
export function BootGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    boot().then(
      ({ api }) => { if (live) setState({ status: "ready", api }); },
      (e: unknown) => { if (live) setState({ status: "error", message: e instanceof Error && e.message ? e.message : "Unknown error" }); },
    );
    return () => { live = false; };
  }, [attempt]);

  if (state.status === "loading") return <p className="text-sm text-muted" role="status">Opening your data on this device...</p>;
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="danger" title="Korra could not open its local database">
          <p>Your data stays in this browser and nothing was sent anywhere. This can happen in a private window, or when the browser blocks site storage. Try again, or open Korra in a normal window.</p>
          <p className="mt-2 text-xs">Details: {state.message}</p>
        </Alert>
        <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </div>
    );
  }
  return <LocalProviders api={state.api}>{children}</LocalProviders>;
}
