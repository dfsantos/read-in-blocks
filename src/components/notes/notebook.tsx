"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { NoteDoc } from "@/domain/notes/rich-text";
import { useRouter } from "@/i18n/navigation";
import type {
  CreateNoteResult,
  DeleteNoteResult,
  NoteResult,
} from "@/server/actions/notes";

import { useAutosave, type AutosaveStatus } from "./use-autosave";

// The editor (Tiptap, ProseMirror and the highlighter) is downloaded only when the reader starts
// writing or editing (US-019): reading a notebook never pays for it.
const NoteEditor = dynamic(() => import("./note-editor"), {
  ssr: false,
  loading: EditorLoading,
});

function EditorLoading() {
  const t = useTranslations("notes.editor");
  return (
    <p className="text-muted-foreground min-h-32 rounded-lg border p-3 text-sm">
      {t("loading")}
    </p>
  );
}

export type NotebookNote = Readonly<{
  id: string;
  // The stored document, to open in the editor.
  content: NoteDoc;
  // Its read-only view, rendered on the server (NoteContent).
  view: ReactNode;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NoteInputPayload = { content: unknown };

export type NotebookActions = Readonly<{
  create: (input: NoteInputPayload) => Promise<CreateNoteResult>;
  update: (noteId: string, input: NoteInputPayload) => Promise<NoteResult>;
  remove: (noteId: string) => Promise<DeleteNoteResult>;
}>;

type Props = Readonly<{
  // The node's title, for the labels of the list.
  title: string;
  // Oldest first (chronological order), as the repository lists them.
  notes: readonly NotebookNote[];
  // The notebook Server Actions; injected so tests can replace them.
  actions: NotebookActions;
}>;

function useStamp() {
  const format = useFormatter();
  return (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
}

// A node's notebook (US-018, RF-005): its notes in chronological order, each with when it was
// written and last edited, and the means to add, edit (rich text, saved on its own, US-019) and
// delete (with confirmation) notes. Notes are the reader's content: shown through the read-only
// view, never as markup. The page refreshes its data without reloading (router.refresh).
export function Notebook({ title, notes, actions }: Props) {
  const t = useTranslations("notes");
  const headingId = useId();
  const [announcement, setAnnouncement] = useState("");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted-foreground text-sm">
          {t("count", { count: notes.length })}
        </span>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ol
          aria-label={t("listLabel", { title })}
          className="flex flex-col gap-3"
        >
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              actions={actions}
              announce={setAnnouncement}
            />
          ))}
        </ol>
      )}
      <AddNote actions={actions} announce={setAnnouncement} />
    </section>
  );
}

function AddNote({
  actions,
  announce,
}: Readonly<{
  actions: NotebookActions;
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("add.open")}
      </Button>
    );
  }
  return (
    <NewNote
      actions={actions}
      announce={announce}
      close={() => setOpen(false)}
    />
  );
}

// A new note saves itself like an edit (useAutosave): the first save creates it, the next ones
// update it. "Save" sends what is left and shows it in the list; "Discard" only exists while
// nothing was saved.
function NewNote({
  actions,
  announce,
  close,
}: Readonly<{
  actions: NotebookActions;
  announce: (message: string) => void;
  close: () => void;
}>) {
  const t = useTranslations("notes");
  const router = useRouter();
  const id = useId();
  const createdId = useRef<string | undefined>(undefined);
  const [created, setCreated] = useState(false);
  const [closing, setClosing] = useState(false);
  const autosave = useAutosave(async (input) => {
    if (createdId.current) return actions.update(createdId.current, input);
    const result = await actions.create(input);
    if (!result.ok) return result;
    createdId.current = result.id;
    setCreated(true);
    return { ok: true };
  });

  async function save() {
    setClosing(true);
    const saved = await autosave.flush();
    setClosing(false);
    if (!saved) return;
    if (createdId.current) {
      announce(t("add.saved"));
      router.refresh();
    }
    close();
  }

  return (
    <div className="flex flex-col gap-2">
      <span aria-hidden="true" className="text-sm font-medium">
        {t("add.label")}
      </span>
      <NoteEditor
        label={t("add.label")}
        autoFocus
        invalid={autosave.status.kind === "failed"}
        describedBy={`${id}-status`}
        onUpdate={autosave.schedule}
        onSubmit={() => void save()}
      />
      <AutosaveIndicator status={autosave.status} id={`${id}-status`} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={closing} onClick={() => void save()}>
          {t("add.submit")}
        </Button>
        {created ? null : (
          <Button
            type="button"
            variant="ghost"
            disabled={closing || autosave.status.kind === "saving"}
            onClick={() => {
              autosave.discard();
              close();
            }}
          >
            {t("add.discard")}
          </Button>
        )}
      </div>
    </div>
  );
}

function NoteItem({
  note,
  actions,
  announce,
}: Readonly<{
  note: NotebookNote;
  actions: NotebookActions;
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const stamp = useStamp();
  const [editing, setEditing] = useState(false);
  const created = stamp(note.createdAt);
  const edited = note.updatedAt.getTime() !== note.createdAt.getTime();

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">
        <time dateTime={note.createdAt.toISOString()}>
          {t("createdAt", { date: created })}
        </time>
        {edited ? (
          <>
            {" · "}
            <time dateTime={note.updatedAt.toISOString()}>
              {t("updatedAt", { date: stamp(note.updatedAt) })}
            </time>
          </>
        ) : null}
      </p>
      {editing ? (
        <EditNote
          note={note}
          update={actions.update}
          close={() => setEditing(false)}
          announce={announce}
        />
      ) : (
        <>
          {note.view}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("edit.openFor", { date: created })}
              onClick={() => setEditing(true)}
            >
              {t("edit.open")}
            </Button>
            <DeleteNoteButton
              noteId={note.id}
              label={t("delete.openFor", { date: created })}
              remove={actions.remove}
              announce={announce}
            />
          </div>
        </>
      )}
    </li>
  );
}

function AutosaveIndicator({
  status,
  id,
}: Readonly<{ status: AutosaveStatus; id: string }>) {
  const t = useTranslations("notes");
  let text = "";
  if (status.kind === "unsaved") text = t("autosave.unsaved");
  if (status.kind === "saving") text = t("autosave.saving");
  if (status.kind === "saved") text = t("autosave.saved");
  if (status.kind === "failed") {
    text = t("autosave.failed", { reason: t(`errors.${status.errorKey}`) });
  }
  return (
    <p
      id={id}
      role="status"
      aria-live="polite"
      className={
        status.kind === "failed"
          ? "text-destructive text-sm"
          : "text-muted-foreground text-sm"
      }
    >
      {text}
    </p>
  );
}

// Edits a note in place; every change is saved on its own (useAutosave). "Done" saves what is left
// and shows the note again.
function EditNote({
  note,
  update,
  close,
  announce,
}: Readonly<{
  note: NotebookNote;
  update: NotebookActions["update"];
  close: () => void;
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const router = useRouter();
  const id = useId();
  const autosave = useAutosave((input) => update(note.id, input));
  const [closing, setClosing] = useState(false);
  const failed = autosave.status.kind === "failed";

  async function done() {
    const changed = autosave.status.kind !== "idle";
    setClosing(true);
    const saved = await autosave.flush();
    setClosing(false);
    if (!saved) return;
    if (changed) announce(t("edit.saved"));
    close();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <NoteEditor
        label={t("edit.label")}
        initialContent={note.content}
        autoFocus
        invalid={failed}
        describedBy={`${id}-status`}
        onUpdate={autosave.schedule}
        onSubmit={() => void done()}
      />
      <AutosaveIndicator status={autosave.status} id={`${id}-status`} />
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={closing}
        onClick={() => void done()}
      >
        {t("edit.done")}
      </Button>
    </div>
  );
}

// Deletes a note after an explicit confirmation. The Server Action checks the session, the owner
// and the quota on its own.
function DeleteNoteButton({
  noteId,
  label,
  remove,
  announce,
}: Readonly<{
  noteId: string;
  label: string;
  remove: NotebookActions["remove"];
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<DeleteNoteErrorKey>();

  async function confirm() {
    setPending(true);
    setErrorKey(undefined);
    const result = await remove(noteId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      announce(t("delete.deleted"));
      router.refresh();
      return;
    }
    setErrorKey(result.errorKey);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setErrorKey(undefined);
      }}
    >
      <AlertDialogTrigger
        render={<Button size="sm" variant="ghost" aria-label={label} />}
      >
        {t("delete.open")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorKey ? (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${errorKey}`)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? t("delete.deleting") : t("delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DeleteNoteErrorKey = Extract<DeleteNoteResult, { ok: false }>["errorKey"];
