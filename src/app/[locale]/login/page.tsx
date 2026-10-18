import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routing } from "@/i18n/routing";
import { isGoogleSignInEnabled } from "@/server/auth";

import { loginErrorKey } from "./login-error";

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

async function resolveLocale(params: Props["params"]) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "login" });
  return { title: t("metadataTitle") };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations("login");
  const errorKey = loginErrorKey((await searchParams).error);
  const googleEnabled = isGoogleSignInEnabled();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorKey ? (
            <p role="alert" className="text-destructive text-sm">
              {t(errorKey)}
            </p>
          ) : null}
          {googleEnabled ? (
            <GoogleSignInButton />
          ) : (
            <p className="text-muted-foreground text-sm">{t("unavailable")}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
