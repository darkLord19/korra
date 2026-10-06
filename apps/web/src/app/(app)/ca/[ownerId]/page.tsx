import { redirect } from "next/navigation";
import { currentMonthIST } from "@/lib/format";

export default async function ClientHome({ params }: { params: Promise<{ ownerId: string }> }) {
  redirect(`/ca/${(await params).ownerId}/months/${currentMonthIST()}`);
}
