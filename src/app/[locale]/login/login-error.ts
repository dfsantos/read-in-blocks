import { ACCOUNT_NOT_ALLOWED } from "@/server/auth/options";

// Maps the `?error=` the OAuth callback appends to a message key. The value itself is never shown
// (it is attacker-controlled), and every refusal looks the same to the person signing in.
export type LoginErrorKey =
  "errors.notAllowed" | "errors.cancelled" | "errors.failed";

export function loginErrorKey(
  error: string | string[] | undefined,
): LoginErrorKey | undefined {
  if (error === undefined) return undefined;
  if (error === ACCOUNT_NOT_ALLOWED) return "errors.notAllowed";
  // Google returns access_denied when the person cancels on its consent screen.
  if (error === "access_denied") return "errors.cancelled";
  return "errors.failed";
}
