import { eq } from "drizzle-orm";

import * as authSchema from "@/db/auth-schema";
import type { Database } from "@/db/client";
import type { SignInCandidate } from "@/server/auth/allowlist";

// The e-mail and its verification for the user a session is being created for (US-004). Called by
// the auth session hook with the user id Better Auth resolved on the server, never a client value.
export async function findSignInCandidate(
  db: Database,
  userId: string,
): Promise<SignInCandidate | undefined> {
  const [row] = await db
    .select({
      email: authSchema.user.email,
      emailVerified: authSchema.user.emailVerified,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);
  return row;
}
