import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Setup is the first task on Home. */
export default function OnboardingPage() {
  redirect("/home");
}
