import { Suspense } from "react";
import { MonthRoute } from "@/components/routes";

export const metadata = { title: "Month" };

// useSearchParams needs a Suspense boundary on a prerendered page.
export default function MonthPage() {
  return <Suspense fallback={<p className="text-sm text-muted" role="status">Loading...</p>}><MonthRoute /></Suspense>;
}
