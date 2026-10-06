import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate: no session cookie on an app route -> /sign-in. Not a security boundary;
 * every page and action still resolves the real session via ownerCtx().
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/onboarding/:path*", "/months/:path*", "/packs/:path*", "/tracker/:path*", "/settings/:path*", "/ca/:path*"],
};
