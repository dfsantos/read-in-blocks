import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { DeleteBookButton } from "@/components/books/delete-book-button";
import { ProgressPanel } from "@/components/progress/progress-panel";
import { BookStructure } from "@/components/structure/book-structure";
import { TableOfContents } from "@/components/toc/table-of-contents";
import { buttonVariants } from "@/components/ui/button";
import { bookIdSchema } from "@/domain/books/book-input";
import { buildTree } from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { editBookPath, LIBRARY_PATH } from "@/lib/routes";
import {
  addNodes,
  completeAll,
  deleteNode,
  moveNode,
  setReadingDates,
  setReadingStatus,
  updateNode,
} from "@/server/actions/book-nodes";
import { deleteBook } from "@/server/actions/books";
import { requireUser } from "@/server/auth/session";
import { foundOrNotFound } from "@/server/not-found";
import { listNodes } from "@/server/repositories/book-nodes";
import { findBook } from "@/server/repositories/books";
import { countNotesByNode } from "@/server/repositories/notes";

type Props = Readonly<{ params: Promise<{ bookId: string }> }>;

// The reader's book, or the 404 page: a malformed id, a missing book and another reader's book
// all get the same answer (zero-trust.md, 1.4). Memoized so metadata and page query once.
const loadBook = cache(async (bookId: string) => {
  const user = await requireUser();
  const id = bookIdSchema.safeParse(bookId);
  return foundOrNotFound(
    id.success ? await findBook(user.id, id.data) : undefined,
  );
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await loadBook((await params).bookId);
  const t = await getTranslations("books.detail");
  return { title: t("metadataTitle", { title: book.title }) };
}

// The book page (US-007), with its edit and delete actions (US-009), its weighted progress
// (US-016), its interactive table of contents (US-015) with each node's notebook (US-018) and its structure of parts, chapters and
// topics (US-010).
export default async function BookPage({ params }: Props) {
  const book = await loadBook((await params).bookId);
  const user = await requireUser();
  const [nodes, noteCounts] = await Promise.all([
    listNodes(user.id, book.id),
    countNotesByNode(user.id, book.id),
  ]);
  const tree = buildTree(nodes);
  const t = await getTranslations("books.detail");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link
        href={LIBRARY_PATH}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 self-start rounded-md text-sm outline-none focus-visible:ring-3"
      >
        {t("backToLibrary")}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words">{book.title}</h1>
        <p className="text-muted-foreground break-words">
          {book.author ? t("byAuthor", { author: book.author }) : t("noAuthor")}
        </p>
      </header>
      <div
        role="group"
        aria-label={t("actionsLabel")}
        className="flex flex-wrap gap-3"
      >
        <Link
          href={editBookPath(book.id)}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("edit")}
        </Link>
        {/* The bound id is still an argument the client sends: the action parses it again. */}
        <DeleteBookButton
          title={book.title}
          action={deleteBook.bind(null, book.id)}
        />
      </div>
      <ProgressPanel tree={tree} />
      <TableOfContents
        bookId={book.id}
        nodes={nodes}
        noteCounts={noteCounts}
        actions={{
          setStatus: setReadingStatus,
          setDates: setReadingDates,
          completeAll,
        }}
      />
      {/* The bound ids are still arguments the client sends: the actions parse them again. */}
      <BookStructure
        tree={tree}
        actions={{
          add: addNodes.bind(null, book.id),
          update: updateNode,
          move: moveNode,
          setStatus: setReadingStatus,
          setDates: setReadingDates,
          completeAll,
          remove: deleteNode,
        }}
      />
    </main>
  );
}
