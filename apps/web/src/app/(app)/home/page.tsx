import { HomeScreen } from "@korra/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/** The to-do list. The (app) layout already requires a signed-in user; HomeScreen loads its own data and handles setup. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const raw = (await searchParams).task;
  const task = (Array.isArray(raw) ? raw[0] : raw) || null;
  return <HomeScreen taskId={task} />;
}
