"use client";
import Link from "next/link";
import { useFlow } from "@/lib/flow";

const NAV = [
  { href: "/month", label: "Month" },
  { href: "/tracker", label: "Tracker" },
  { href: "/settings", label: "Settings" },
];

export function MainNav() {
  const flow = useFlow();
  if (flow !== "tracking") return null;
  return (
    <nav aria-label="Main" className="flex gap-1 text-sm">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 hover:bg-accent-soft">
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
