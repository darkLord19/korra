import { Suspense } from "react";
import { HomeRoute } from "@/components/routes";

export const metadata = { title: "Home" };

// useSearchParams needs a Suspense boundary on a prerendered page.
export default function HomePage() {
  return <Suspense fallback={<p className="text-sm text-muted" role="status">Loading...</p>}><HomeRoute /></Suspense>;
}
