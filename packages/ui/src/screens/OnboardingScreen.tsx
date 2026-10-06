"use client";
import type { OnboardingWire } from "@korra/backend/schemas";
import { Alert, Card, CardBody, CardHeader } from "../components";
import { useApi, useNav } from "../context";
import { AddBankForm } from "../forms/BankForms";
import { ProfileForm } from "../forms/ProfileForm";
import { useLoaded } from "./useLoaded";

/** First-run setup: AD banks, then the exporter profile. Saving the profile goes to the app's home. */
export function OnboardingScreen({ initial }: { initial?: OnboardingWire }) {
  const api = useApi();
  const nav = useNav();
  const { data: ob, error, reload } = useLoaded<OnboardingWire>(() => api.getOnboarding(), initial, "onboarding");
  if (!ob) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
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
          <AddBankForm onSaved={() => void reload()} />
        </CardBody>
      </Card>
      <Card aria-labelledby="profile-h">
        <CardHeader id="profile-h" title="Exporter profile" />
        <CardBody><ProfileForm profile={ob.profile} banks={ob.banks} onSaved={() => nav.push(nav.hrefs.home())} /></CardBody>
      </Card>
    </div>
  );
}
