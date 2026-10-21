import { useFormatter, useTranslations } from "next-intl";

import {
  computeProgress,
  countChapters,
  wholePercent,
} from "@/domain/progress/compute";
import { readingPace, type Pace } from "@/domain/progress/pace";
import type { TreeNode } from "@/domain/structure/tree";

import { ProgressBar } from "./progress-bar";

type Props = Readonly<{
  // The book's structure, every parent with its derived state (buildTree).
  tree: readonly TreeNode[];
  // Today in the app's time zone (D-19), from the server, for the pace (US-023).
  today: string;
}>;

// The book's weighted progress (US-016, RF-008): the whole book and each part and chapter, weighted
// by their goals in pages, where only completed leaves count (D-03). Next to it, a plain count of
// completed chapters, kept apart so it is not mistaken for the percentage. A Server Component
// (no client code): the page refreshes it after every change. Below, the reading pace and the expected
// finish (US-023), left out once the book is finished. Titles are the reader's content, rendered as text.
export function ProgressPanel({ tree, today }: Props) {
  const t = useTranslations("progress");
  const format = useFormatter();

  if (tree.length === 0) {
    return (
      <section aria-labelledby="progress-title" className="flex flex-col gap-2">
        <h2 id="progress-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      </section>
    );
  }

  const progress = computeProgress(tree);
  const chapters = countChapters(tree);
  const percentOf = (share: number) => {
    const percent = wholePercent(share);
    return {
      percent,
      text: format.number(percent / 100, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
    };
  };
  const overall = percentOf(progress.overall);

  return (
    <section
      aria-labelledby="progress-title"
      className="flex flex-col gap-4 rounded-xl border p-4"
    >
      <h2 id="progress-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {overall.text}
            </span>
            <span className="text-muted-foreground text-sm">
              {t("overallLabel")}
            </span>
          </p>
          {chapters.total > 0 ? (
            <p className="text-sm">
              {t("chapters", {
                completed: chapters.completed,
                total: chapters.total,
              })}
            </p>
          ) : null}
        </div>
        <ProgressBar
          percent={overall.percent}
          valueText={overall.text}
          label={t("overallBar")}
        />
        <p className="text-muted-foreground text-xs">{t("rule")}</p>
        {progress.defaultWeighted > 0 ? (
          <p role="note" className="text-muted-foreground text-xs">
            {t("defaultWeight", { count: progress.defaultWeighted })}
          </p>
        ) : null}
      </div>
      <PaceSummary pace={readingPace(tree, today)} />
      <ul aria-label={t("sectionsLabel")} className="flex flex-col gap-3">
        {tree.map((node) => (
          <li key={node.id} className="flex flex-col gap-1">
            <Section
              title={node.title}
              share={progress.byNode.get(node.id) ?? 0}
              percentOf={percentOf}
              barLabel={t("sectionBar", { title: node.title })}
            />
            {node.kind === "part" && node.children.length > 0 ? (
              <ul className="ml-4 flex flex-col gap-1 border-l pl-3">
                {node.children.map((chapter) => (
                  <li key={chapter.id}>
                    <Section
                      title={chapter.title}
                      share={progress.byNode.get(chapter.id) ?? 0}
                      percentOf={percentOf}
                      barLabel={t("sectionBar", { title: chapter.title })}
                      small
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({
  title,
  share,
  percentOf,
  barLabel,
  small,
}: Readonly<{
  title: string;
  share: number;
  percentOf: (share: number) => { percent: number; text: string };
  barLabel: string;
  small?: boolean;
}>) {
  const { percent, text } = percentOf(share);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={
            small ? "min-w-0 text-sm break-words" : "min-w-0 break-words"
          }
        >
          {title}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {text}
        </span>
      </div>
      <ProgressBar
        percent={percent}
        valueText={text}
        label={barLabel}
        className={small ? "h-1.5" : undefined}
      />
    </div>
  );
}

// A calendar day ("YYYY-MM-DD") as a Date at noon UTC, so formatting it in the app's time zone (D-19)
// never shifts it to the day before or after.
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

function PaceSummary({ pace }: Readonly<{ pace: Pace }>) {
  const t = useTranslations("progress.pace");
  const format = useFormatter();
  if (pace.kind === "empty" || pace.kind === "completed") return null;

  return (
    <section
      aria-labelledby="pace-title"
      className="flex flex-col gap-1 text-sm"
    >
      <h3 id="pace-title" className="font-medium">
        {t("title")}
      </h3>
      {pace.kind === "forecast" ? (
        <>
          <p className="font-medium">
            {t("forecast", {
              date: format.dateTime(asDate(pace.finishOn), {
                dateStyle: "long",
              }),
            })}
          </p>
          <p>
            {t("rate", {
              percent: format.number(pace.sharePerWeek, {
                style: "percent",
                maximumFractionDigits: 1,
              }),
              count: pace.completions,
              days: pace.days,
            })}
          </p>
          <p className="text-muted-foreground text-xs">{t("rule")}</p>
        </>
      ) : (
        <>
          <p>{t("insufficient")}</p>
          <p className="text-muted-foreground text-xs">
            {t("insufficientNow", { count: pace.completions })}
          </p>
        </>
      )}
    </section>
  );
}
