// Security events (zero-trust.md, 3.3): user id and a reason at most. Never e-mails, names,
// tokens or provider data.
export type AuthEvent =
  | { event: "auth.login"; userId: string }
  | { event: "auth.login_denied"; reason: string; userId?: string }
  | { event: "auth.logout"; userId: string }
  | { event: "auth.session_revoked"; reason: string; userId: string };

export function logAuthEvent(entry: AuthEvent): void {
  console.info(JSON.stringify({ ...entry, at: new Date().toISOString() }));
}
