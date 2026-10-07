"use client";
import type { ReactNode } from "react";
import type { OnboardingWire } from "@korra/backend/schemas";
import { Alert, Card, CardBody, CardHeader } from "../components";
import { useApi } from "../context";
import { ProfileForm } from "../forms/ProfileForm";
import { useLoaded } from "./useLoaded";

/**
 * Parts of Settings that differ per app. The app supplies them; each shows only when the adapter's
 * `capabilities` say the app has the feature.
 */
export interface SettingsSlots {
  /** "Share with my CA" panel. Shown when `capabilities.caSharing`. */
  caSharing?: ReactNode;
  /** Backup and restore panel. Shown when `capabilities.backup`. */
  backup?: ReactNode;
  /** "Your data" panel: where data lives and how to delete it (account deletion on a server, wiping this browser locally). Always shown when given. */
  data?: ReactNode;
}

export function SettingsScreen({ initial, slots = {} }: { initial?: OnboardingWire; slots?: SettingsSlots }) {
  const api = useApi();
  const { data: ob, error, reload } = useLoaded<OnboardingWire>(() => api.getOnboarding(), initial, "settings");
  if (!ob) return error ? <Alert tone="danger">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading...</p>;
  const { caSharing, backup } = api.capabilities;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <Card aria-labelledby="profile-h">
        <CardHeader id="profile-h" title="Exporter profile" description="These details go on every EDF. The bank you choose is where new invoices are filed." />
        <CardBody><ProfileForm profile={ob.profile} banks={ob.banks} submitLabel="Save profile" onSaved={() => void reload()} /></CardBody>
      </Card>

      {caSharing && slots.caSharing}
      {backup && slots.backup}
      {slots.data}
    </div>
  );
}
