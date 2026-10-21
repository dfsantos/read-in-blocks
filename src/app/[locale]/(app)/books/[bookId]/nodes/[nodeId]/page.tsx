import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { NoteContent } from "@/components/notes/note-content";
import { Notebook } from "@/components/notes/notebook";
import { NodeReading } from "@/components/structure/node-reading";
import { bookIdSchema } from "@/domain/books/book-input";
import { nodeIdSchema } from "@/domain/structure/node-input";
import { buildTree, pathTo } from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { bookPath, nodePath } from "@/lib/routes";
import {
  completeAll,
  setReadingDates,
  setReadingStatus,
} from "@/server/actions/book-nodes";
import { createNote, deleteNote, updateNote } from "@/server/actions/notes";
import { requireUser } from "@/server/auth/session";
import { foundOrNotFound } from "@/server/not-found";
import { listNodes } from "@/server/repositories/book-nodes";
import { findBook } from "@/server/repositories/books";
import { listNotes } from "@/server/repositories/notes";

type Props = Readonly<{
  params: Promise<{ bookId: string; nodeId: string }>;
}>;

// The reader's book and node, with the path from the book's root down to it, or the 404 page: a
// malformed id, a missing book or node, a node of another book and another reader's all get the
// same answer (zero-trust.md, 1.4). Memoized so metadata and page query once.
const loadNode = cache(async (bookId: string, nodeId: string) => {
  const user = await requireUser();
  const bookIdParsed = bookIdSchema.safeParse(bookId);
  const nodeIdParsed = nodeIdSchema.safeParse(nodeId);
  const book = foundOrNotFound(
    bookIdParsed.success && nodeIdParsed.success
      ? await findBook(user.id, bookIdParsed.data)
      : undefined,
  );
  const tree = buildTree(await listNodes(user.id, book.id));
  const path = pathTo(tree, nodeIdParsed.data ?? "");
  const node = foundOrNotFound(path.at(-1));
  return { user, book, node, ancestors: path.slice(0, -1) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { bookId, nodeId } = await params;
  const { node } = await loadNode(bookId, nodeId);
  const t = await getTranslations("notes");
  return { title: t("metadataTitle", { title: node.title }) };
}

// A node of the book (US-018): where it sits in the book, its summary, goal and reading state, and
// its notebook. Reached from the table of contents (US-015) and its details panel.
export default async function NodePage({ params }: Props) {
  const { bookId, nodeId } = await params;
  const { user, book, node, ancestors } = await loadNode(bookId, nodeId);
  const notes = await listNotes(user.id, node.id);
  const t = await getTranslations("notes");
  const tStructure = await getTranslations("structure");
  const tToc = await getTranslations("toc");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <nav aria-label={t("breadcrumbLabel")}>
        <ol className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
          <li>
            <Link
              href={bookPath(book.id)}
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-md break-words outline-none focus-visible:ring-3"
            >
              {t("backToBook", { title: book.title })}
            </Link>
          </li>
          {ancestors.map((ancestor) => (
            <li key={ancestor.id} className="flex items-center gap-x-1">
              <span aria-hidden="true">/</span>
              <Link
                href={nodePath(book.id, ancestor.id)}
                className="hover:text-foreground focus-visible:ring-ring/50 rounded-md break-words outline-none focus-visible:ring-3"
              >
                {ancestor.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase">
          {tStructure(`kinds.${node.kind}`)}
        </span>
        <h1 className="text-2xl font-semibold break-words">{node.title}</h1>
      </header>
      <dl className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">
            {tToc("details.summary")}
          </dt>
          <dd className="break-words whitespace-pre-line">
            {node.summary ?? tToc("details.noSummary")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            {tToc("details.goal")}
          </dt>
          <dd>
            {node.goalPages === null
              ? tStructure("details.defaultWeight")
              : tStructure("details.goal", { count: node.goalPages })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            {tToc("details.state")}
          </dt>
          <dd>
            <NodeReading
              node={node}
              actions={{
                setStatus: setReadingStatus,
                setDates: setReadingDates,
                completeAll,
              }}
            />
          </dd>
        </div>
      </dl>
      {/* The bound id is still an argument the client sends: the action parses it again. */}
      <Notebook
        title={node.title}
        notes={notes.map((note) => ({
          id: note.id,
          content: note.content,
          // Rendered here, on the server: the notebook never ships the highlighter.
          view: <NoteContent content={note.content} />,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        }))}
        actions={{
          create: createNote.bind(null, node.id),
          update: updateNote,
          remove: deleteNote,
        }}
      />
    </main>
  );
}
