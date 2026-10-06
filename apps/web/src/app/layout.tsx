import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Korra",
  description: "EDF packs and realisation tracking for Indian exporters",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
