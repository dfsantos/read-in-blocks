"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { noteInputSchema } from "@/domain/notes/note-input";
import type { NoteErrorKey, NoteResult } from "@/server/actions/notes";

// Saves a note being written or edited on its own (US-019, ADR-0007): a while after the reader
// stops typing, when the reader finishes and when the editor closes (navigating inside the app). One save at a time, always with the latest
// content. While something is unsaved the browser asks before leaving the page (beforeunload).

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; errorKey: NoteErrorKey };

// Well inside the quota of 60 updates a minute (src/server/actions/notes.ts).
export const AUTOSAVE_DELAY_MS = 1_500;

// Asks the browser to confirm leaving while `active` (the text of the prompt is the browser's).
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [active]);
}

// What the notebook sends for a note: its document, its kind and a quote's reference (US-020).
export type NoteDraft = {
  content: unknown;
  type: unknown;
  reference?: unknown;
};

// The client check only spares a round trip: the Server Action parses again.
export function checkNote(draft: NoteDraft): NoteErrorKey | undefined {
  const parsed = noteInputSchema.safeParse(draft);
  return parsed.success
    ? undefined
    : (parsed.error.issues[0].message as NoteErrorKey);
}

export function useAutosave(save: (input: NoteDraft) => Promise<NoteResult>) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const pending = useRef<NoteDraft | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<boolean> | undefined>(undefined);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Sends the latest content, after the save already running. True when nothing is left unsaved.
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (running.current) await running.current;
    const next = pending.current;
    if (!next) return true;

    const invalid = checkNote(next);
    if (invalid) {
      setStatus({ kind: "failed", errorKey: invalid });
      return false;
    }
    pending.current = undefined;
    setStatus({ kind: "saving" });
    const run = (async () => {
      let result: NoteResult;
      try {
        result = await saveRef.current(next);
      } catch {
        result = { ok: false, errorKey: "failed" };
      }
      if (!result.ok) {
        // Kept for the next attempt, unless the reader typed something newer meanwhile.
        pending.current ??= next;
        setStatus({ kind: "failed", errorKey: result.errorKey });
        return false;
      }
      setStatus(pending.current ? { kind: "unsaved" } : { kind: "saved" });
      return pending.current === undefined;
    })();
    running.current = run;
    try {
      return await run;
    } finally {
      if (running.current === run) running.current = undefined;
    }
  }, []);

  const schedule = useCallback(
    (draft: NoteDraft) => {
      pending.current = draft;
      setStatus({ kind: "unsaved" });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the editor (closing it, navigating inside the app) still saves what was typed.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const next = pending.current;
      if (next && !checkNote(next)) void saveRef.current(next);
    },
    [],
  );

  useLeaveGuard(
    status.kind === "unsaved" ||
      status.kind === "saving" ||
      status.kind === "failed",
  );

  // Drops what was not saved yet (a new note the reader gives up on).
  const discard = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = undefined;
    setStatus({ kind: "idle" });
  }, []);

  return { status, schedule, flush, discard };
}
