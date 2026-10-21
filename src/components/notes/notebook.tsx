"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_BODY_MAX, noteInputSchema } from "@/domain/notes/note-input";
import { useRouter } from "@/i18n/navigation";
import type {
  DeleteNoteResult,
  NoteErrorKey,
  NoteResult,
} from "@/server/actions/notes";

export type NotebookNote = Readonly<{
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NotebookActions = Readonly<{
  create: (input: { body: string }) => Promise<NoteResult>;
  update: (noteId: string, input: { body: string }) => Promise<NoteResult>;
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

// The client check only spares a round trip: the Server Action parses again.
function check(body: string): NoteErrorKey | undefined {
  const parsed = noteInputSchema.safeParse({ body });
  return parsed.success
    ? undefined
    : (parsed.error.issues[0].message as NoteErrorKey);
}

function useStamp() {
  const format = useFormatter();
  return (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
}

// A node's notebook (US-018, RF-005): its notes in chronological order, each with when it was
// written and last edited, and forms to add, edit and delete (with confirmation) plain-text notes.
// Notes are the reader's content: rendered as text, never as markup. The page refreshes its data
// without reloading (router.refresh).
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
      <AddNoteForm create={actions.create} announce={setAnnouncement} />
    </section>
  );
}

function AddNoteForm({
  create,
  announce,
}: Readonly<{
  create: NotebookActions["create"];
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<NoteErrorKey>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = check(body);
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    setPending(true);
    setErrorKey(undefined);
    const result = await create({ body });
    setPending(false);
    if (result.ok) {
      setBody("");
      announce(t("add.saved"));
      router.refresh();
      return;
    }
    setErrorKey(result.errorKey);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Field data-invalid={errorKey ? true : undefined}>
        <FieldLabel htmlFor={`${id}-body`}>{t("add.label")}</FieldLabel>
        <Textarea
          id={`${id}-body`}
          value={body}
          rows={4}
          maxLength={NOTE_BODY_MAX}
          placeholder={t("add.placeholder")}
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={errorKey ? `${id}-error` : undefined}
          onChange={(event) => setBody(event.target.value)}
        />
        {errorKey ? (
          <FieldError id={`${id}-error`}>{t(`errors.${errorKey}`)}</FieldError>
        ) : null}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("add.saving") : t("add.submit")}
      </Button>
    </form>
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
        <EditNoteForm
          note={note}
          update={actions.update}
          close={() => setEditing(false)}
          announce={announce}
        />
      ) : (
        <>
          <p className="text-sm break-words whitespace-pre-wrap">{note.body}</p>
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

function EditNoteForm({
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
  const [body, setBody] = useState(note.body);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<NoteErrorKey>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = check(body);
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    setPending(true);
    setErrorKey(undefined);
    const result = await update(note.id, { body });
    setPending(false);
    if (result.ok) {
      announce(t("edit.saved"));
      close();
      router.refresh();
      return;
    }
    setErrorKey(result.errorKey);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Field data-invalid={errorKey ? true : undefined}>
        <FieldLabel htmlFor={`${id}-body`} className="sr-only">
          {t("edit.label")}
        </FieldLabel>
        <Textarea
          id={`${id}-body`}
          value={body}
          rows={4}
          maxLength={NOTE_BODY_MAX}
          autoFocus
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={errorKey ? `${id}-error` : undefined}
          onChange={(event) => setBody(event.target.value)}
        />
        {errorKey ? (
          <FieldError id={`${id}-error`}>{t(`errors.${errorKey}`)}</FieldError>
        ) : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("edit.saving") : t("edit.save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={close}
        >
          {t("edit.cancel")}
        </Button>
      </div>
    </form>
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
