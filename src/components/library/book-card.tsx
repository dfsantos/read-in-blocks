import { useFormatter, useTranslations } from "next-intl";

import { ProgressBar } from "@/components/progress/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { computeProgress, wholePercent } from "@/domain/progress/compute";
import { resumePoint } from "@/domain/reading/resume";
import type { TreeNode } from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { bookPath, nodePath } from "@/lib/routes";

type Props = Readonly<{
  book: { id: string; title: string; author: string | null };
  // The book's structure, every parent with its derived state (buildTree); empty without structure.
  tree: readonly TreeNode[];
  // How many notes each node has; nodes without notes may be left out.
  noteCounts: Readonly<Record<string, number>>;
}>;

// The nodes with notes, in reading order (the order of the table of contents).
function withNotes(
  nodes: readonly TreeNode[],
  noteCounts: Readonly<Record<string, number>>,
): { node: TreeNode; count: number }[] {
  return nodes.flatMap((node) => {
    const count = noteCounts[node.id] ?? 0;
    return [
      ...(count > 0 ? [{ node, count }] : []),
      ...withNotes(node.children, noteCounts),
    ];
  });
}

// A book in the library (US-021, RF-009): its weighted progress (US-016) and where to pick it back up
// (the first leaf in progress, else the first not started), with "Resume" opening that node's page
// and notebook. A finished book says so and offers its notes chapter by chapter; a book without
// structure says how to start. A Server Component; titles are the reader's content, rendered as text.
export function BookCard({ book, tree, noteCounts }: Props) {
  const t = useTranslations("library");
  const format = useFormatter();
  const resume = resumePoint(tree);
  const percent = wholePercent(computeProgress(tree).overall);
  const percentText = format.number(percent / 100, {
    style: "percent",
    maximumFractionDigits: 0,
  });

  return (
    <article className="flex flex-col gap-3 rounded-xl border p-4">
      <Link
        href={bookPath(book.id)}
        className="hover:text-primary focus-visible:ring-ring/50 flex flex-col gap-1 self-start rounded-md outline-none focus-visible:ring-3"
      >
        <span className="font-medium break-words">{book.title}</span>
        <span className="text-muted-foreground text-sm break-words">
          {book.author ?? t("noAuthor")}
        </span>
      </Link>

      {resume.kind === "empty" ? (
        <p className="text-muted-foreground text-sm">{t("book.noStructure")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <ProgressBar
              percent={percent}
              valueText={percentText}
              label={t("book.progressBar", { title: book.title })}
              className="flex-1"
            />
            <span className="text-muted-foreground text-sm tabular-nums">
              {t("book.progress", { percent: percentText })}
            </span>
          </div>
        </div>
      )}

      {resume.kind === "resume" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-sm break-words">
            {resume.started
              ? t("book.current", { title: resume.node.title })
              : t("book.next", { title: resume.node.title })}
          </p>
          <Link
            href={nodePath(book.id, resume.node.id)}
            aria-label={
              resume.started
                ? t("book.resumeLabel", {
                    book: book.title,
                    title: resume.node.title,
                  })
                : t("book.startLabel", {
                    book: book.title,
                    title: resume.node.title,
                  })
            }
            className={buttonVariants({ size: "sm" })}
          >
            {resume.started ? t("book.resume") : t("book.start")}
          </Link>
        </div>
      ) : null}

      {resume.kind === "completed" ? (
        <CompletedBook book={book} tree={tree} noteCounts={noteCounts} />
      ) : null}
    </article>
  );
}

function CompletedBook({ book, tree, noteCounts }: Props) {
  const t = useTranslations("library");
  const noted = withNotes(tree, noteCounts);

  return (
    <div className="flex flex-col gap-2">
      {/* A check mark and a word: the state is never told by color alone. */}
      <p className="flex items-center gap-1 text-sm font-medium">
        <span aria-hidden="true">✓</span>
        {t("book.completed")}
      </p>
      <details className="text-sm">
        <summary className="focus-visible:ring-ring/50 cursor-pointer self-start rounded-md outline-none focus-visible:ring-3">
          {t("book.revisit")}
        </summary>
        {noted.length === 0 ? (
          <p className="text-muted-foreground mt-2">{t("book.noNotes")}</p>
        ) : (
          <ul
            aria-label={t("book.revisitLabel", { title: book.title })}
            className="mt-2 flex flex-col gap-1"
          >
            {noted.map(({ node, count }) => (
              <li key={node.id}>
                <Link
                  href={nodePath(book.id, node.id)}
                  className="hover:text-primary focus-visible:ring-ring/50 rounded-md break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3"
                >
                  {t("book.revisitItem", { title: node.title, count })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
