import { useTranslations } from "next-intl";

import type { DensityLevel } from "@/domain/notes/density";
import { cn } from "@/lib/utils";

// How densely a chapter was annotated (US-024): three bars of growing height, as many filled as its
// level, next to a word and the count, so the level is never told by color alone. The bars are
// drawn with SVG attributes: the CSP refuses inline styles.
export function DensityMeter({
  level,
  notes,
  className,
}: Readonly<{ level: DensityLevel; notes: number; className?: string }>) {
  const t = useTranslations("density");
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 14 10"
        className="h-2.5 w-3.5 shrink-0"
      >
        {[1, 2, 3].map((bar) => (
          <rect
            key={bar}
            x={(bar - 1) * 5}
            y={10 - bar * 3 - 1}
            width="4"
            height={bar * 3 + 1}
            className={bar <= level ? "fill-primary" : "fill-muted"}
          />
        ))}
      </svg>
      <span>{t("label", { level: t(`levels.${level}`), count: notes })}</span>
    </span>
  );
}
