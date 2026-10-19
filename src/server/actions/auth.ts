"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/routes";
import { getAuth } from "@/server/auth";
import { logAuthEvent } from "@/server/auth/log";
import { requireUser } from "@/server/auth/session";

// Ends the current session (US-005). Takes no input: whatever a caller posts is ignored. Without a
// session requireUser() redirects before anything runs; Next.js checks the Origin of every action.
export async function signOut(): Promise<never> {
  const user = await requireUser();
  // Deletes the session row; nextCookies clears the cookie in this action's response.
  await getAuth().api.signOut({ headers: await headers() });
  logAuthEvent({ event: "auth.logout", userId: user.id });
  redirect(LOGIN_PATH);
}
