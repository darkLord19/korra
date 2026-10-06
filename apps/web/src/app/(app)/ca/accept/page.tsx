import Link from "next/link";
import { getCaInvite, NotFoundError, type CaInviteWire } from "@korra/backend";
import { SignOutButton } from "@/components/SignOutButton";
import { Alert, Card, CardBody, CardHeader, buttonClass } from "@/components/ui";
import { currentUser, ownerCtx } from "@/server/ctx";
import { AcceptForm } from "./AcceptForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invitation" };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ctx = await ownerCtx(); // signed in (the proxy sent anyone else to /sign-in with this URL as `next`)
  const user = await currentUser();
  let invite: CaInviteWire | null = null;
  if (token) {
    try {
      invite = await getCaInvite(ctx, token);
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-semibold">Invitation to view records</h1>
      <Card aria-labelledby="invite-h">
        <CardHeader id="invite-h" title={invite ? `${invite.ownerName} invited you` : "Invitation not found"} />
        <CardBody className="space-y-4 text-sm">
          {!invite ? (
            <Alert tone="danger">This invitation link is not valid. Check that you copied the whole link from the email, or ask the sender to invite you again.</Alert>
          ) : invite.isOwner ? (
            <Alert tone="warning">You sent this invitation, so you cannot accept it. Send the link to your CA instead.</Alert>
          ) : invite.status === "revoked" ? (
            <Alert tone="warning">{invite.ownerName} has removed this invitation. Ask them to send a new one.</Alert>
          ) : !invite.emailMatches ? (
            <div className="space-y-3">
              <Alert tone="warning" title="This invitation is for a different email address">
                It was sent to {invite.caEmail}, and you are signed in as {user?.email}. Sign out, then sign in or create an account with {invite.caEmail} and open the link again.
              </Alert>
              <SignOutButton />
            </div>
          ) : invite.status === "accepted" ? (
            <div className="space-y-3">
              <p>You have already accepted this invitation.</p>
              <Link href="/ca" className={buttonClass("primary")}>Go to your clients</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="max-w-prose">{invite.ownerName} wants to share their export records with you. You will be able to view and download their EDF packs and see their realisation tracker. You will not be able to change anything, and they can remove your access at any time.</p>
              <AcceptForm token={token!} />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
