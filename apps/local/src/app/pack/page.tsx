import { Suspense } from "react";
import { PackRoute } from "@/components/routes";

export const metadata = { title: "EDF pack" };

export default function PackPage() {
  return <Suspense fallback={<p className="text-sm text-muted" role="status">Loading...</p>}><PackRoute /></Suspense>;
}
