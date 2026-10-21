import { useTranslations } from "next-intl";

import { chapterDensity, mostNoted } from "@/domain/notes/density";
import type { TreeNode } from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { nodePath } from "@/lib/routes";

import { DensityMeter } from "./density-meter";

// How many chapters the list shows.
const MOST_NOTED_LIMIT = 5;

// The chapters the reader annotated the most (US-024, RF-014), most first, each leading to its
// notebook. A Server Component; titles are the reader's content, rendered as text.
export function MostNoted({
  bookId,
  tree,
  noteCounts,
}: Readonly<{
  bookId: string;
  tree: readonly TreeNode[];
  noteCounts: Readonly<Record<string, number>>;
}>) {
  const t = useTranslations("density.mostNoted");
  const density = chapterDensity(tree, noteCounts);
  if (density.length === 0) return null;
  const top = mostNoted(density, MOST_NOTED_LIMIT);

  return (
    <section
      aria-labelledby="most-noted-title"
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <h2 id="most-noted-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {top.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <>
          <ol aria-label={t("listLabel")} className="flex flex-col gap-2">
            {top.map(({ chapter, notes, level }) => (
              <li
                key={chapter.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <Link
                  href={nodePath(bookId, chapter.id)}
                  className="hover:text-primary focus-visible:ring-ring/50 min-w-0 rounded-md break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3"
                >
                  {chapter.title}
                </Link>
                <DensityMeter
                  level={level}
                  notes={notes}
                  className="text-muted-foreground text-sm"
                />
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">{t("rule")}</p>
        </>
      )}
    </section>
  );
}
