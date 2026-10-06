import { describe, expect, it } from "vitest";
import { UnauthenticatedError, createAuth, getCaCtx, getOwnerCtx } from "./index";
import { createTestDeps } from "./testing";

describe("Better Auth wiring", () => {
  it("sign up -> verification email via the mailer -> verify -> sign in -> session gives an owner ctx", async () => {
    const deps = await createTestDeps();
    const auth = createAuth(deps);

    await auth.api.signUpEmail({ body: { name: "Jane", email: "jane@example.test", password: "correct-horse-battery" } });
    const mail = deps.mailer.sent.find((m) => m.to === "jane@example.test");
    expect(mail?.subject).toMatch(/Verify/);

    // not verified yet: sign-in is refused
    await expect(auth.api.signInEmail({ body: { email: "jane@example.test", password: "correct-horse-battery" } })).rejects.toThrow();

    const url = new URL(/https?:\/\/\S+/.exec(mail!.text)![0]);
    await auth.api.verifyEmail({ query: { token: url.searchParams.get("token")! } });

    const res = await auth.api.signInEmail({
      body: { email: "jane@example.test", password: "correct-horse-battery" },
      returnHeaders: true,
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });

    const ctx = await getOwnerCtx(deps, headers);
    expect(ctx.actor).toEqual({ userId: res.response.user.id, role: "owner" });
    expect(await getCaCtx(deps, headers, "owner-1")).toMatchObject({ actor: { role: "ca", ownerUserId: "owner-1" } });
    await expect(getOwnerCtx(deps, new Headers())).rejects.toBeInstanceOf(UnauthenticatedError);

    const session = await auth.api.getSession({ headers });
    expect((session!.user as { plan?: string }).plan).toBe("free");
  });
});
