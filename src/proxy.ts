import { getSessionCookie } from "better-auth/cookies";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath, loginURL } from "./lib/routes";
import {
  createNonce,
  NONCE_HEADER,
  pageCsp,
  PRIVATE_NO_STORE,
} from "./lib/security-headers";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

// Every page response (US-028): a CSP with this request's nonce, and never cached, since pages are
// rendered per reader. Static headers (HSTS, nosniff…) come from next.config.ts.
function secured(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

export default function proxy(request: NextRequest) {
  const { pathname, search, protocol } = request.nextUrl;
  const nonce = createNonce();
  const csp = pageCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https: protocol === "https:",
  });

  // Optimistic redirect only (US-005): it looks for the session cookie, not at the session itself.
  // A forged or expired cookie passes here and is refused by requireUser() in the page or action,
  // which is the real access control (zero-trust.md, 3.1).
  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    return secured(
      NextResponse.redirect(loginURL(request.url, `${pathname}${search}`)),
      csp,
    );
  }

  // Next.js reads the nonce from the request's CSP header and stamps its own scripts with it;
  // next-intl forwards the request headers to the page.
  request.headers.set(NONCE_HEADER, nonce);
  request.headers.set("Content-Security-Policy", csp);
  return secured(handleI18nRouting(request), csp);
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
