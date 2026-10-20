import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { BookForm } from "@/components/books/book-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { bookIdSchema } from "@/domain/books/book-input";
import { Link } from "@/i18n/navigation";
import { bookPath } from "@/lib/routes";
import { updateBook } from "@/server/actions/books";
import { requireUser } from "@/server/auth/session";
import { foundOrNotFound } from "@/server/not-found";
import { findBook } from "@/server/repositories/books";

type Props = Readonly<{ params: Promise<{ bookId: string }> }>;

// Same answer as the book page: a malformed id, a missing book and another reader's book are all
// the 404 page (zero-trust.md, 1.4). Memoized so metadata and page query once.
const loadBook = cache(async (bookId: string) => {
  const user = await requireUser();
  const id = bookIdSchema.safeParse(bookId);
  return foundOrNotFound(
    id.success ? await findBook(user.id, id.data) : undefined,
  );
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await loadBook((await params).bookId);
  const t = await getTranslations("books.edit");
  return { title: t("metadataTitle", { title: book.title }) };
}

// Editing a book's title and author (US-009). The page guards itself; the action guards itself
// again, owner included.
export default async function EditBookPage({ params }: Props) {
  const book = await loadBook((await params).bookId);
  const t = await getTranslations("books.edit");

  return (
    <main className="flex flex-1 justify-center p-4 sm:p-6">
      <Card className="w-full max-w-lg self-start">
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* The bound id is still an argument the client sends: the action parses it again. */}
          <BookForm
            mode="edit"
            action={updateBook.bind(null, book.id)}
            initialValues={{ title: book.title, author: book.author }}
          />
          <Link
            href={bookPath(book.id)}
            className={buttonVariants({
              variant: "ghost",
              className: "self-start",
            })}
          >
            {t("cancel")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
