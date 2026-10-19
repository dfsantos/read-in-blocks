import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath, loginURL } from "./lib/routes";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

// Optimistic redirect only (US-005): it looks for the session cookie, not at the session itself.
// A forged or expired cookie passes here and is refused by requireUser() in the page or action,
// which is the real access control (zero-trust.md, 3.1).
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(loginURL(request.url, `${pathname}${search}`));
  }
  return handleI18nRouting(request);
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
