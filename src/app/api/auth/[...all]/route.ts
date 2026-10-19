import { toNextJsHandler } from "better-auth/next-js";

import { PRIVATE_NO_STORE } from "@/lib/security-headers";
import { getAuth } from "@/server/auth";
import { guardWrite } from "@/server/request-guard";

// Better Auth endpoints (sign-in, OAuth callback, session, sign-out). Public by design: this is
// where a session is created. Better Auth validates its own input and checks Origin/CSRF; the
// allowlist runs in its database hooks (src/server/auth/options.ts). Listed in zero-trust.md.
// Rate limited by the Vercel Firewall and by Better Auth itself (US-028).
export const dynamic = "force-dynamic";

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
  return privateResponse(await toNextJsHandler(getAuth()).GET(request));
}

// Writes are refused before Better Auth reads the body when they come from another origin or carry
// a body larger than any auth request needs (US-028).
export async function POST(request: Request) {
  return (
    guardWrite(request) ??
    privateResponse(await toNextJsHandler(getAuth()).POST(request))
  );
}
