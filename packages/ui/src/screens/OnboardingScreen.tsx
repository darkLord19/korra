"use client";
import type { ReactNode } from "react";
import type { OnboardingWire } from "@korra/backend/schemas";
import { Alert, Card, CardBody, CardHeader } from "../components";
import { useApi, useNav } from "../context";
import { ProfileForm, type InvoiceHandoff } from "../forms/ProfileForm";
import { useLoaded } from "./useLoaded";

/** First-run setup: the exporter profile and the bank, in one form. Saving the profile goes to the app's home. */
export function OnboardingScreen({ initial, step, onSaved }: {
  initial?: OnboardingWire; step?: ReactNode;
  /** Called once the profile is saved, with the invoice the form was filled from (if any), before going to the app's home. */
  onSaved?: (invoice?: InvoiceHandoff) => void;
}) {
  const api = useApi();
  const nav = useNav();
  const { data: ob, error } = useLoaded<OnboardingWire>(() => api.getOnboarding(), initial, "onboarding");
  if (!ob) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        {step && <div className="text-sm font-medium text-muted">{step}</div>}
        <h1 className="text-3xl font-semibold">Set up your details</h1>
        <p className="mt-2 text-sm text-muted">These go on every EDF. You do this once and can change it later.</p>
      </div>
      <Card aria-labelledby="profile-h">
        <CardHeader id="profile-h" title="Exporter profile" />
        <CardBody>
          <ProfileForm
            profile={ob.profile}
            banks={ob.banks}
            fillFromInvoice
            onSaved={(invoice) => {
              onSaved?.(invoice);
              nav.push(nav.hrefs.home());
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
