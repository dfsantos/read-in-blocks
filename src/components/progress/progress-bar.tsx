import { cn } from "@/lib/utils";

type Props = Readonly<{
  // Whole percent, 0 to 100 (wholePercent).
  percent: number;
  // The formatted percent, read out by screen readers.
  valueText: string;
  label: string;
  className?: string;
}>;

// An accessible progress bar (US-016): role=progressbar with its values. Drawn with an SVG width
// attribute instead of the shadcn Progress, whose indicator sets an inline style the CSP refuses
// (style-src without 'unsafe-inline', US-028).
export function ProgressBar({ percent, valueText, label, className }: Props) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={cn(
        "bg-muted h-2 w-full overflow-hidden rounded-full",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        <rect width={percent} height="1" className="fill-primary" />
      </svg>
    </div>
  );
}
