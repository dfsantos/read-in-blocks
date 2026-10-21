import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookCard } from "@/components/library/book-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { buildTree } from "@/domain/structure/tree";
import { NEW_BOOK_PATH } from "@/lib/routes";
import { requireUser } from "@/server/auth/session";
import { listLibraryNodes } from "@/server/repositories/book-nodes";
import { listBooks } from "@/server/repositories/books";
import { countLibraryNotes } from "@/server/repositories/notes";

// Far beyond a personal library; past it, the page shows the most recent ones and says so.
const LIBRARY_LIMIT = 500;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("metadataTitle") };
}

// The reader's library (US-008): their books, the most recent first, each opening its page, with its
// progress and where to resume it (US-021). The page guards itself: the layout's check does not run again on client navigations.
export default async function LibraryPage() {
  const user = await requireUser();
  // One more than shown, to know whether there are more.
  const [found, nodesByBook, noteCounts] = await Promise.all([
    listBooks(user.id, { limit: LIBRARY_LIMIT + 1 }),
    listLibraryNodes(user.id),
    countLibraryNotes(user.id),
  ]);
  const books = found.slice(0, LIBRARY_LIMIT);
  const t = await getTranslations("library");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {books.length > 0 ? (
          <Link href={NEW_BOOK_PATH} className={buttonVariants()}>
            {t("create")}
          </Link>
        ) : null}
      </div>

      {books.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("empty.title")}</h2>
            </CardTitle>
            <CardDescription>{t("empty.description")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href={NEW_BOOK_PATH} className={buttonVariants()}>
              {t("empty.cta")}
            </Link>
          </CardFooter>
        </Card>
      ) : (
        <ul aria-label={t("listLabel")} className="flex flex-col gap-3">
          {books.map((book) => (
            <li key={book.id}>
              <BookCard
                book={book}
                tree={buildTree(nodesByBook.get(book.id) ?? [])}
                noteCounts={noteCounts}
              />
            </li>
          ))}
        </ul>
      )}
      {found.length > LIBRARY_LIMIT ? (
        <p className="text-muted-foreground text-sm">
          {t("truncated", { count: LIBRARY_LIMIT })}
        </p>
      ) : null}
    </main>
  );
}
