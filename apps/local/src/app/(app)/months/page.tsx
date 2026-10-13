import { Suspense } from "react";
import { MonthsRoute } from "@/components/routes";

export const metadata = { title: "Months" };

export default function MonthsPage() {
  return <Suspense fallback={<p className="text-sm text-muted" role="status">Loading...</p>}><MonthsRoute /></Suspense>;
}
