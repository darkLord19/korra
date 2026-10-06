import { VerifyNotice } from "@/components/AuthForms";
export const metadata = { title: "Check your email" };
export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  return <VerifyNotice email={(await searchParams).email ?? null} />;
}
