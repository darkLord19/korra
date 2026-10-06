import { getOnboarding } from "@korra/backend";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { ownerCtx } from "@/server/ctx";
import { AddBankForm, ProfileForm } from "./OnboardingForms";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ob = await getOnboarding(await ownerCtx());
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Set up your details</h1>
        <p className="mt-2 text-sm text-muted">These go on every EDF. You do this once and can change it later.</p>
      </div>
      <Card aria-labelledby="banks-h">
        <CardHeader id="banks-h" title="Your AD banks" description="The bank (or banks) where you file EDFs. Korra prepares one pack per bank." />
        <CardBody className="space-y-4">
          {ob.banks.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {ob.banks.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 px-3 py-2"><span>{b.name}</span><span className="text-muted">AD code {b.adCode}</span></li>
              ))}
            </ul>
          )}
          <AddBankForm />
        </CardBody>
      </Card>
      <Card aria-labelledby="profile-h">
        <CardHeader id="profile-h" title="Exporter profile" />
        <CardBody><ProfileForm profile={ob.profile} banks={ob.banks} /></CardBody>
      </Card>
    </div>
  );
}
