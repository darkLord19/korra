"use client";
import Link from "next/link";
import { buttonClass } from "@korra/ui";
import { setFlow, useFlow } from "@/lib/flow";

export function LandingCta() {
  const flow = useFlow();

  let label = "Prepare my EDF";
  let href = "/onboarding";

  if (flow === "started") {
    label = "Continue your EDF";
    href = "/month";
  } else if (flow === "tracking") {
    label = "Open Korra";
    href = "/month";
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <Link href={href} className={buttonClass("primary")}>
        {label}
      </Link>
      {flow !== "tracking" && (
        <Link
          href="/month"
          onClick={() => setFlow("tracking")}
          className="text-sm text-muted underline hover:text-ink"
        >
          Skip to full app
        </Link>
      )}
    </div>
  );
}

export function LandingSkipLink() {
  const flow = useFlow();
  if (flow === "tracking") return null;
  return (
    <Link
      href="/month"
      onClick={() => setFlow("tracking")}
      className="text-sm text-muted underline hover:text-ink"
    >
      Skip to full app
    </Link>
  );
}
