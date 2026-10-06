import { SignInForm } from "@/components/AuthForms";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site relative paths.
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <SignInForm next={safe} />;
}
