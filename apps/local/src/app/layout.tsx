import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: { default: "Korra", template: "%s | Korra" },
  description: "EDF packs and realisation tracking for Indian service exporters. Everything stays in your browser.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
