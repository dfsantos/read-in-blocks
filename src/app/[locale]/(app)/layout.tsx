import { getTranslations } from "next-intl/server";

import { UserMenu } from "@/components/auth/user-menu";
import { Link } from "@/i18n/navigation";
import { LIBRARY_PATH } from "@/lib/routes";
import { requireUser } from "@/server/auth/session";

type Props = Readonly<{ children: React.ReactNode }>;

// Shell for every signed-in page (US-005). It checks the session itself; each page and action
// still calls requireUser(), since layouts do not re-run on client navigations.
export default async function AppLayout({ children }: Props) {
  const user = await requireUser();
  const t = await getTranslations("app");

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-background border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4 sm:gap-4">
          <Link
            href={LIBRARY_PATH}
            className="focus-visible:ring-ring/50 shrink-0 rounded-md font-semibold outline-none focus-visible:ring-3"
          >
            {t("name")}
          </Link>
          <nav aria-label={t("navLabel")} className="flex flex-1 items-center">
            <Link
              href={LIBRARY_PATH}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md px-2 py-1 text-sm outline-none focus-visible:ring-3"
            >
              {t("nav.library")}
            </Link>
          </nav>
          <UserMenu name={user.name} image={user.image} />
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
