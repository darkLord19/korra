import { redirect } from "next/navigation";
import { currentMonthIST } from "@korra/ui";

export default async function ClientHome({ params }: { params: Promise<{ ownerId: string }> }) {
  redirect(`/ca/${(await params).ownerId}/months/${currentMonthIST()}`);
}
