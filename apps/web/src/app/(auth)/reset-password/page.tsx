import { ResetPasswordForm } from "@/components/AuthForms";
export const metadata = { title: "New password" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <ResetPasswordForm token={(await searchParams).token ?? null} />;
}
