import { RedirectTo } from "@/components/routes";

export const metadata = { title: "Payments due" };

export default function TrackerPage() {
  return <RedirectTo to="/months" />;
}
