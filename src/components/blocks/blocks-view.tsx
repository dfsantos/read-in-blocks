import { useFormatter, useTranslations } from "next-intl";

import { DensityMeter } from "@/components/notes/density-meter";
import { ProgressBar } from "@/components/progress/progress-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chapterDensity } from "@/domain/notes/density";
import { computeProgress, wholePercent } from "@/domain/progress/compute";
import type { TreeNode } from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { nodePath } from "@/lib/routes";

type Props = Readonly<{
  bookId: string;
  // The book's structure, every parent with its derived state (buildTree).
  tree: readonly TreeNode[];
  // How many notes each node has; nodes without notes may be left out.
  noteCounts: Readonly<Record<string, number>>;
}>;

type Group = { part: TreeNode | null; chapters: TreeNode[] };

// Parts in order, each with its chapters; chapters at the book's root gather in groups without a
// part, kept where they sit between the parts (a preface before Part I, an epilogue after the last).
function groups(tree: readonly TreeNode[]): Group[] {
  const result: Group[] = [];
  for (const node of tree) {
    if (node.kind === "part") {
      result.push({ part: node, chapters: node.children });
    } else {
      const last = result.at(-1);
      if (last && last.part === null) last.chapters.push(node);
      else result.push({ part: null, chapters: [node] });
    }
  }
  return result;
}

// The blocks view (US-017, RF-011): the structure as cards grouped by part, each chapter a card with
// its state, weighted progress, goal and note density (US-024), leading to its page and notebook. A Server Component;
// titles are the reader's content, rendered as text.
export function BlocksView({ bookId, tree, noteCounts }: Props) {
  const t = useTranslations("blocks");
  const tStructure = useTranslations("structure");
  const format = useFormatter();
  const progress = computeProgress(tree);
  // Each chapter's notes, its topics' included, and how dense they are (US-024).
  const density = new Map(
    chapterDensity(tree, noteCounts).map((entry) => [entry.chapter.id, entry]),
  );

  return (
    <section aria-labelledby="blocks-title" className="flex flex-col gap-4">
      <h2 id="blocks-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {tree.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}
      {groups(tree).map((group, index) => {
        const headingId = `blocks-${group.part?.id ?? `loose-${index}`}`;
        return (
          <section
            key={headingId}
            aria-labelledby={headingId}
            className="flex flex-col gap-3"
          >
            <h3 id={headingId} className="font-medium break-words">
              {group.part ? (
                <Link
                  href={nodePath(bookId, group.part.id)}
                  className="hover:text-primary focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-3"
                >
                  {group.part.title}
                </Link>
              ) : (
                t("noPart")
              )}
            </h3>
            {group.chapters.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("emptyPart")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.chapters.map((chapter) => {
                  const percent = wholePercent(
                    progress.byNode.get(chapter.id) ?? 0,
                  );
                  const percentText = format.number(percent / 100, {
                    style: "percent",
                    maximumFractionDigits: 0,
                  });
                  const notes = density.get(chapter.id) ?? {
                    notes: 0,
                    level: 0 as const,
                  };
                  return (
                    <li key={chapter.id}>
                      <Card size="sm" className="relative h-full">
                        <CardHeader>
                          <CardTitle className="break-words">
                            {/* The whole card is the link's target area. */}
                            <Link
                              href={nodePath(bookId, chapter.id)}
                              className="focus-visible:ring-ring/50 rounded-md outline-none after:absolute after:inset-0 focus-visible:ring-3"
                            >
                              {chapter.title}
                            </Link>
                          </CardTitle>
                          <CardDescription>
                            {tStructure(`reading.statuses.${chapter.status}`)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <ProgressBar
                              percent={percent}
                              valueText={percentText}
                              label={t("progressBar", { title: chapter.title })}
                              className="flex-1"
                            />
                            <span className="text-muted-foreground tabular-nums">
                              {percentText}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {chapter.goalPages === null
                              ? tStructure("details.defaultWeight")
                              : t("goal", {
                                  goal: tStructure("details.goal", {
                                    count: chapter.goalPages,
                                  }),
                                })}
                          </p>
                          <DensityMeter
                            level={notes.level}
                            notes={notes.notes}
                            className="text-muted-foreground"
                          />
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
