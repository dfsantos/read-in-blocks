import { desc, eq } from "drizzle-orm";

import * as authSchema from "@/db/auth-schema";
import type { Database } from "@/db/client";

import { ownedBy } from "./owner-scope";

// Reference repository for the owner-scoped pattern (US-006, docs/architecture/data-access.md):
// the reader's own sign-in sessions. Every function takes the userId from requireUser() and
// applies it to every query; another reader's session behaves exactly like a missing one.

// What a reader may see about a session. Never the token: it is the session credential.
export type OwnSession = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
};

const ownSessionColumns = {
  id: authSchema.session.id,
  createdAt: authSchema.session.createdAt,
  expiresAt: authSchema.session.expiresAt,
  userAgent: authSchema.session.userAgent,
};

export async function listSessions(
  db: Database,
  userId: string,
): Promise<OwnSession[]> {
  return db
    .select(ownSessionColumns)
    .from(authSchema.session)
    .where(ownedBy(authSchema.session.userId, userId))
    .orderBy(desc(authSchema.session.createdAt), desc(authSchema.session.id));
}

// undefined both when the session does not exist and when it belongs to someone else.
export async function findSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<OwnSession | undefined> {
  const [row] = await db
    .select(ownSessionColumns)
    .from(authSchema.session)
    .where(
      ownedBy(
        authSchema.session.userId,
        userId,
        eq(authSchema.session.id, sessionId),
      ),
    )
    .limit(1);
  return row;
}

// Signs out one of the reader's devices. false both when the session does not exist and when it
// belongs to someone else.
export async function deleteSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(authSchema.session)
    .where(
      ownedBy(
        authSchema.session.userId,
        userId,
        eq(authSchema.session.id, sessionId),
      ),
    )
    .returning({ id: authSchema.session.id });
  return deleted.length > 0;
}
