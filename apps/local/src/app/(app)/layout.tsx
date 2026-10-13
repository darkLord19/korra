import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@korra/ui";
import { AppFrame } from "@/components/AppFrame";
import { PrivacyNotice } from "@/components/PrivacyCopy";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame
      banners={<PrivacyNotice />}
      belowMain={<div className="mx-auto w-full max-w-6xl px-4 text-xs text-muted">Your documents and details are stored only in this browser. Korra has no server copy.{" "}<Link href="/privacy" className="underline">Privacy</Link></div>}
      footer={<Footer />}
    >
      {children}
    </AppFrame>
  );
}
