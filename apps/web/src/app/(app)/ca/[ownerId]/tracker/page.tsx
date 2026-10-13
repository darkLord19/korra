import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientTrackerPage({ params }: { params: Promise<{ ownerId: string }> }) {
  redirect(`/ca/${(await params).ownerId}/months`);
}
