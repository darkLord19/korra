"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Field, Input } from "@/components/ui";

type Result = { error?: { message?: string; code?: string } | null };

function useSubmit(run: (data: FormData) => Promise<Result | void>) {
  const [error, setError] = useState<{ message: string; code?: string | undefined } | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await run(new FormData(e.currentTarget));
      if (r?.error) setError({ message: r.error.message || "Something went wrong. Try again.", code: r.error.code });
    } catch {
      setError({ message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }
  return { error, pending, onSubmit };
}

function Shell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

const s = (d: FormData, k: string) => String(d.get(k) ?? "");

export function SignUpForm() {
  const router = useRouter();
  const { error, pending, onSubmit } = useSubmit(async (d) => {
    const email = s(d, "email");
    const r = await authClient.signUp.email({ name: s(d, "name"), email, password: s(d, "password"), callbackURL: "/" });
    if (r.error) return r;
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  });
  return (
    <Shell title="Create your account" intro="Free to start. We will email you a link to confirm your address.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="name" label="Your name"><Input id="name" name="name" autoComplete="name" required /></Field>
        <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field id="password" label="Password" hint="At least 8 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        {error && <Alert tone="danger">{error.message}</Alert>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating account..." : "Create account"}</Button>
      </form>
      <p className="mt-4 text-sm text-muted">Already have an account? <Link href="/sign-in" className="text-accent underline">Sign in</Link></p>
    </Shell>
  );
}

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [unverified, setUnverified] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const { error, pending, onSubmit } = useSubmit(async (d) => {
    const email = s(d, "email");
    setUnverified(null);
    setResent(false);
    const r = await authClient.signIn.email({ email, password: s(d, "password") });
    if (r.error) {
      if (r.error.status === 403 || r.error.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(email);
        return { error: { message: "Confirm your email address first. Check your inbox for the link." } };
      }
      return { error: { message: r.error.message || "Email or password is not right." } };
    }
    router.push(next);
    router.refresh();
  });
  return (
    <Shell title="Sign in">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field id="password" label="Password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        {error && <Alert tone="danger">{error.message}</Alert>}
        {unverified && !resent && (
          <Button variant="secondary" onClick={async () => { await authClient.sendVerificationEmail({ email: unverified, callbackURL: "/" }); setResent(true); }}>
            Send the link again
          </Button>
        )}
        {resent && <Alert tone="success">We sent a new link to {unverified}.</Alert>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in..." : "Sign in"}</Button>
      </form>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-muted">
        <Link href="/sign-up" className="text-accent underline">Create an account</Link>
        <Link href="/forgot-password" className="text-accent underline">Forgot your password?</Link>
      </p>
    </Shell>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { error, pending, onSubmit } = useSubmit(async (d) => {
    const r = await authClient.requestPasswordReset({ email: s(d, "email"), redirectTo: "/reset-password" });
    if (r.error) return r;
    setSent(true);
  });
  return (
    <Shell title="Reset your password" intro="Enter your email and we will send a link to choose a new password.">
      {sent ? (
        <Alert tone="success">If that address has an account, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="email" label="Email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
          {error && <Alert tone="danger">{error.message}</Alert>}
          <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending..." : "Send reset link"}</Button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link href="/sign-in" className="text-accent underline">Back to sign in</Link></p>
    </Shell>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const { error, pending, onSubmit } = useSubmit(async (d) => {
    const r = await authClient.resetPassword({ newPassword: s(d, "password"), token: token ?? "" });
    if (r.error) return r;
    router.push("/sign-in");
  });
  if (!token) {
    return (
      <Shell title="Reset your password">
        <Alert tone="danger">This reset link is missing or has expired. <Link href="/forgot-password" className="underline">Ask for a new one.</Link></Alert>
      </Shell>
    );
  }
  return (
    <Shell title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="password" label="New password" hint="At least 8 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        {error && <Alert tone="danger">{error.message}</Alert>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving..." : "Save password"}</Button>
      </form>
    </Shell>
  );
}

export function VerifyNotice({ email }: { email: string | null }) {
  const [sent, setSent] = useState(false);
  return (
    <Shell title="Check your email" intro={email ? `We sent a confirmation link to ${email}. Open it on this device to finish signing up.` : "We sent you a confirmation link. Open it on this device to finish signing up."}>
      {sent ? (
        <Alert tone="success">Sent again. It can take a minute to arrive.</Alert>
      ) : email ? (
        <Button variant="secondary" onClick={async () => { await authClient.sendVerificationEmail({ email, callbackURL: "/" }); setSent(true); }}>Send the link again</Button>
      ) : null}
      <p className="mt-4 text-sm"><Link href="/sign-in" className="text-accent underline">Back to sign in</Link></p>
    </Shell>
  );
}
