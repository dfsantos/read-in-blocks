"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  renderDiagram,
  type DiagramResult,
} from "@/components/notes/diagram-renderer";

// A note's diagram (US-022): drawn in the browser from its Mermaid text, shown as an image. Used by
// the read-only view and, as a preview, under the diagram's text in the editor. A text Mermaid
// cannot read shows a friendly message instead; the rest of the note is untouched.

export type NoteDiagramProps = Readonly<{
  source: string;
  // The editor redraws a short while after the reader stops typing.
  delay?: number;
  // The read-only view offers the diagram's text, which the editor already shows.
  showSource?: boolean;
}>;

export function NoteDiagram({
  source,
  delay = 0,
  showSource = false,
}: NoteDiagramProps) {
  const t = useTranslations("notes.diagram");
  const [result, setResult] = useState<DiagramResult | null>(null);

  // While the editor waits to redraw, the last drawing stays (no flicker between keystrokes).
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void renderDiagram(source).then((drawn) => {
        if (current) setResult(drawn);
      });
    }, delay);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source, delay]);

  const code = (
    <pre>
      <code className="hljs">{source}</code>
    </pre>
  );

  return (
    <figure className="flex flex-col gap-2">
      {!result ? (
        <p className="text-muted-foreground text-sm">{t("drawing")}</p>
      ) : result.ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: SVG drawn in the browser.
        <img
          src={result.image.src}
          width={result.image.width}
          height={result.image.height}
          alt={result.image.title ?? t("alt")}
          className="h-auto max-w-full self-start rounded-md bg-white"
          data-diagram=""
        />
      ) : (
        <p role="note" className="text-destructive text-sm">
          {result.reason === "unavailable" ? t("unavailable") : t("invalid")}
        </p>
      )}
      {!showSource ? null : result && !result.ok ? (
        code
      ) : (
        <details>
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t("source")}
          </summary>
          {code}
        </details>
      )}
    </figure>
  );
}
