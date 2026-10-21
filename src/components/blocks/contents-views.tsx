"use client";

import { useTranslations } from "next-intl";
import { useId, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const CONTENTS_VIEWS = ["toc", "blocks"] as const;
export type ContentsView = (typeof CONTENTS_VIEWS)[number];

// The reader's choice between the table of contents and the blocks is remembered in this browser
// (localStorage), for every book, read through an external store so the server render (the table of
// contents) and the browser agree. Kept in memory too, for when storage is blocked.
const STORAGE_KEY = "read-in-blocks:contents-view";
const DEFAULT_VIEW: ContentsView = "toc";
let memory: ContentsView | undefined;
const listeners = new Set<() => void>();

// Anything but a known view (tampered storage) counts as the default.
const asView = (value: unknown): ContentsView =>
  CONTENTS_VIEWS.includes(value as ContentsView)
    ? (value as ContentsView)
    : DEFAULT_VIEW;

function readView(): ContentsView {
  if (memory !== undefined) return memory;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage: the default view.
  }
  memory = asView(stored);
  return memory;
}

function writeView(view: ContentsView) {
  memory = view;
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Full or blocked storage: the choice holds until the page is left.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Switches the book's contents between the interactive table of contents (US-015) and the blocks
// view (US-017). Both are rendered by the server; only the chosen one is shown.
export function ContentsViews({
  toc,
  blocks,
}: Readonly<{ toc: ReactNode; blocks: ReactNode }>) {
  const t = useTranslations("blocks.views");
  const id = useId();
  const view = useSyncExternalStore(subscribe, readView, () => DEFAULT_VIEW);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={t("label")}
        className="flex gap-2 self-start"
      >
        {CONTENTS_VIEWS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={view === option ? "default" : "outline"}
            aria-pressed={view === option}
            aria-controls={`${id}-${option}`}
            onClick={() => writeView(option)}
          >
            {t(option)}
          </Button>
        ))}
      </div>
      <div id={`${id}-toc`} hidden={view !== "toc"}>
        {toc}
      </div>
      <div id={`${id}-blocks`} hidden={view !== "blocks"}>
        {blocks}
      </div>
    </div>
  );
}
