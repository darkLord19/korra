import { RedirectTo } from "@/components/routes";

export const metadata = { title: "Set up" };

export default function OnboardingPage() {
  return <RedirectTo to="/home" />;
}
