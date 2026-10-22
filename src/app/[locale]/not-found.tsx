import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { PageMessage } from "@/components/states/page-message";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LIBRARY_PATH } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("states.notFound");
  return { title: t("metadataTitle") };
}

// The 404 page (US-025), for unknown addresses and for anything the reader may not see: another
// reader's book answers exactly like a book that does not exist (ADR-0008).
export default function NotFound() {
  const t = useTranslations("states.notFound");
  return (
    <PageMessage title={t("title")} description={t("description")}>
      <Link href={LIBRARY_PATH} className={buttonVariants()}>
        {t("back")}
      </Link>
    </PageMessage>
  );
}
