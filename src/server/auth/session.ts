import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { LOGIN_PATH } from "@/lib/routes";

import { decideSignIn, type Allowlist } from "./allowlist";
import { getAuth, getAuthEnv } from "./index";
import { logAuthEvent } from "./log";

// The signed-in reader as pages and actions see it (US-005). The id always comes from the session
// read on the server, never from the client.
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  // Google profile photo, kept only when it is an https URL.
  image: string | null;
};

// The parts of Better Auth's session this module reads.
export type SessionLike = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
  };
} | null;

export type SessionCheck =
  | { status: "ok"; user: SessionUser }
  | { status: "anonymous" }
  | { status: "denied"; reason: "email_unverified" | "not_allowlisted" };

function safeImage(image: string | null | undefined): string | null {
  if (!image) return null;
  try {
    const url = new URL(image);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// A session counts only while its e-mail is verified and still on the allowlist: removing an
// e-mail from AUTH_ALLOWED_EMAILS cuts access on the next request, not when the session expires.
export function checkSession(
  session: SessionLike,
  allowlist: Allowlist,
): SessionCheck {
  if (!session) return { status: "anonymous" };
  const { user } = session;
  const decision = decideSignIn(
    { email: user.email, emailVerified: user.emailVerified === true },
    allowlist,
  );
  if (!decision.allowed) return { status: "denied", reason: decision.reason };
  return {
    status: "ok",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: safeImage(user.image),
    },
  };
}

// The current reader, or undefined. Use requireUser() to guard pages and actions; this is for the
// login page, which must render for visitors. Memoized per request.
export const findSessionUser = cache(
  async (): Promise<SessionUser | undefined> => {
    // Headers first: it makes the page dynamic, so `next build` never prerenders it (no database).
    const requestHeaders = await headers();
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const check = checkSession(session, getAuthEnv().allowlist);
    if (check.status === "denied" && session) {
      // Revoke the session row (and clear the cookie when the caller is a Server Action).
      await auth.api.signOut({ headers: requestHeaders });
      logAuthEvent({
        event: "auth.session_revoked",
        reason: check.reason,
        userId: session.user.id,
      });
    }
    return check.status === "ok" ? check.user : undefined;
  },
);

// The single guard for every page, layout, Server Action and Route Handler (zero-trust.md, 3.1):
// without a valid session it redirects to the login page, which also aborts a Server Action.
// The proxy's cookie check is only a UX shortcut and never replaces this call.
export async function requireUser(): Promise<SessionUser> {
  const user = await findSessionUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}
