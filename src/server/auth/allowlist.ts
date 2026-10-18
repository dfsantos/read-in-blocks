// Who may sign in (D-10, ADR-0005): deny by default. Only Google accounts whose verified e-mail
// is on the allowlist get a user row or a session; an empty allowlist denies everyone.

export type Allowlist = ReadonlySet<string>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAllowlist(emails: readonly string[]): Allowlist {
  return new Set(emails.map(normalizeEmail).filter(Boolean));
}

export type SignInCandidate = { email: string; emailVerified: boolean };

export type SignInDecision =
  | { allowed: true }
  | { allowed: false; reason: "email_unverified" | "not_allowlisted" };

export function decideSignIn(
  candidate: SignInCandidate,
  allowlist: Allowlist,
): SignInDecision {
  if (candidate.emailVerified !== true) {
    return { allowed: false, reason: "email_unverified" };
  }
  if (!allowlist.has(normalizeEmail(candidate.email))) {
    return { allowed: false, reason: "not_allowlisted" };
  }
  return { allowed: true };
}
