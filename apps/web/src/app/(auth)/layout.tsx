import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@korra/ui";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-8 font-serif text-2xl font-semibold tracking-tight">Korra</Link>
        {children}
      </main>
      <Footer />
    </div>
  );
}
