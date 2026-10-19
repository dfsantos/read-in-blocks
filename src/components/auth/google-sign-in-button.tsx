"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { LOGIN_PATH } from "@/lib/routes";

// Relative paths only: Better Auth stores them in the OAuth state and redirects to them after
// the Google callback (`?error=<code>` is appended to the error path on failure).
type Props = Readonly<{
  // Already checked on the server with safeNextPath (login page).
  callbackURL: string;
}>;

export function GoogleSignInButton({ callbackURL }: Props) {
  const t = useTranslations("login");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: LOGIN_PATH,
    });
    // On success the browser is already leaving for Google; only a failed start returns here.
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <Button className="w-full" onClick={signIn} disabled={pending}>
        {pending ? t("redirecting") : t("google")}
      </Button>
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t("errors.failed")}
        </p>
      ) : null}
    </div>
  );
}
