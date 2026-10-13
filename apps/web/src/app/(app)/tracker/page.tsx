import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The tracker is "Payments due" on the months page. */
export default function TrackerPage() {
  redirect("/months");
}
