"use client";

import { useTranslations } from "next-intl";

import { PageMessage } from "@/components/states/page-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LIBRARY_PATH } from "@/lib/routes";

// What an error page shows (US-025). Nothing of the error itself: in production Next.js only sends
// a generic message and a digest, and neither helps the reader.
export function ErrorMessage({ retry }: Readonly<{ retry: () => void }>) {
  const t = useTranslations("states.error");
  return (
    <PageMessage title={t("title")} description={t("description")}>
      <Button type="button" onClick={() => retry()}>
        {t("retry")}
      </Button>
      <Link
        href={LIBRARY_PATH}
        className={buttonVariants({ variant: "outline" })}
      >
        {t("back")}
      </Link>
    </PageMessage>
  );
}
