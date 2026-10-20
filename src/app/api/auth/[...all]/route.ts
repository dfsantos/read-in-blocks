import { toNextJsHandler } from "better-auth/next-js";

import { PRIVATE_NO_STORE } from "@/lib/security-headers";
import { getAuth } from "@/server/auth";
import { guardWrite } from "@/server/request-guard";

// Better Auth endpoints (sign-in, OAuth callback, session). Public by design: this is where a
// session is created. Better Auth validates its own input and checks Origin/CSRF; the allowlist
// runs in its database hooks (src/server/auth/options.ts). Listed in zero-trust.md.
// Rate limited by the Vercel Firewall and by Better Auth itself (US-028).
export const dynamic = "force-dynamic";

const PREFIX = "/api/auth/";

// The only endpoints the app uses (US-028). Everything else is a 404 before Better Auth runs: its
// rate limiter writes a database row per client-chosen path before routing, so unknown paths would
// let one client fill the rate_limit table. Sign-out is a Server Action calling the API directly.
const ENDPOINTS = {
  GET: new Set(["get-session", "callback/google", "error", "ok"]),
  POST: new Set(["sign-in/social"]),
};

function isKnownEndpoint(request: Request, method: keyof typeof ENDPOINTS) {
  const { pathname } = new URL(request.url);
  return (
    pathname.startsWith(PREFIX) &&
    ENDPOINTS[method].has(pathname.slice(PREFIX.length))
  );
}

const notFound = () =>
  new Response(null, {
    status: 404,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });

// Every auth response is about one reader (the session, cookies): never stored by a browser,
// proxy or CDN (US-028). A copy, since a handler's Response headers may be immutable.
function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", PRIVATE_NO_STORE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: Request) {
  if (!isKnownEndpoint(request, "GET")) return notFound();
  return privateResponse(await toNextJsHandler(getAuth()).GET(request));
}

// Writes are refused before Better Auth reads the body when they come from another origin or carry
// a body larger than any auth request needs (US-028).
export async function POST(request: Request) {
  if (!isKnownEndpoint(request, "POST")) return notFound();
  return (
    guardWrite(request) ??
    privateResponse(await toNextJsHandler(getAuth()).POST(request))
  );
}
