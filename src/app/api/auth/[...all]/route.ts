import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth";

// Better Auth endpoints (sign-in, OAuth callback, session, sign-out). Public by design: this is
// where a session is created. Better Auth validates its own input and checks Origin/CSRF; the
// allowlist runs in its database hooks (src/server/auth/options.ts). Listed in zero-trust.md.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
