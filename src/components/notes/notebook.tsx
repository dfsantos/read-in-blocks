"use client";

import dynamic from "next/dynamic";
import {
  CircleCheckIcon,
  CircleHelpIcon,
  LightbulbIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  NOTE_REFERENCE_MAX,
  NOTE_TYPES,
  type NoteType,
} from "@/domain/notes/note-type";
import type { NoteDoc } from "@/domain/notes/rich-text";
import { useRouter } from "@/i18n/navigation";
import type {
  CreateNoteResult,
  DeleteNoteResult,
  NoteErrorKey,
  NoteResult,
  ResolveNoteResult,
} from "@/server/actions/notes";

import {
  useAutosave,
  type AutosaveStatus,
  type NoteDraft,
} from "./use-autosave";

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
  // Its kind (US-020): a quote's reference, an action or question's resolution.
  type: NoteType;
  reference: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NotebookActions = Readonly<{
  create: (input: NoteDraft) => Promise<CreateNoteResult>;
  update: (noteId: string, input: NoteDraft) => Promise<NoteResult>;
  resolve: (noteId: string, resolved: boolean) => Promise<ResolveNoteResult>;
  remove: (noteId: string) => Promise<DeleteNoteResult>;
}>;

// Each kind is told by its icon and its label, never by color alone.
const TYPE_ICONS: Record<NoteType, LucideIcon> = {
  key_concept: LightbulbIcon,
  quote: QuoteIcon,
  action_or_question: CircleHelpIcon,
};

type Filter = "all" | NoteType;

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
// written and last edited, its kind (US-020) and the means to add, edit (rich text, saved on its
// own, US-019), resolve (actions and questions) and delete (with confirmation) notes; the list can
// be filtered by kind. Notes are the reader's content: shown through the read-only
// view, never as markup. The page refreshes its data without reloading (router.refresh).
export function Notebook({ title, notes, actions }: Props) {
  const t = useTranslations("notes");
  const headingId = useId();
  const [announcement, setAnnouncement] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const shown =
    filter === "all" ? notes : notes.filter((note) => note.type === filter);

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
        <TypeFilter notes={notes} filter={filter} onChange={setFilter} />
      )}
      {notes.length > 0 && shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("filter.empty")}</p>
      ) : null}
      {shown.length === 0 ? null : (
        <ol
          aria-label={t("listLabel", { title })}
          className="flex flex-col gap-3"
        >
          {shown.map((note) => (
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

// Shows all notes or those of one kind, with how many each has.
function TypeFilter({
  notes,
  filter,
  onChange,
}: Readonly<{
  notes: readonly NotebookNote[];
  filter: Filter;
  onChange: (filter: Filter) => void;
}>) {
  const t = useTranslations("notes.filter");
  const options: Filter[] = ["all", ...NOTE_TYPES];
  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const Icon = option === "all" ? undefined : TYPE_ICONS[option];
        const count =
          option === "all"
            ? notes.length
            : notes.filter((note) => note.type === option).length;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={filter === option ? "secondary" : "ghost"}
            aria-pressed={filter === option}
            onClick={() => onChange(option)}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            {t(option, { count })}
          </Button>
        );
      })}
    </div>
  );
}

// The kind of a note in the list: icon and label, a quote's reference and whether an action or
// question was resolved.
function KindBadge({ note }: Readonly<{ note: NotebookNote }>) {
  const t = useTranslations("notes");
  const Icon = TYPE_ICONS[note.type];
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
      <span className="bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-0.5">
        <Icon aria-hidden="true" className="size-3.5" />
        {t(`types.${note.type}`)}
      </span>
      {note.reference ? (
        <span className="text-muted-foreground break-all">
          {note.reference}
        </span>
      ) : null}
      {note.type === "action_or_question" && note.resolvedAt ? (
        <span className="inline-flex items-center gap-1">
          <CircleCheckIcon aria-hidden="true" className="size-3.5" />
          {t("resolve.resolved")}
        </span>
      ) : null}
    </p>
  );
}

// The kind fields above the editor: the type and, for a quote, its page or position.
function KindFields({
  type,
  reference,
  errorKey,
  onChange,
}: Readonly<{
  type: NoteType;
  reference: string;
  errorKey?: NoteErrorKey;
  onChange: (patch: { type?: NoteType; reference?: string }) => void;
}>) {
  const t = useTranslations("notes");
  const id = useId();
  const referenceInvalid = errorKey?.startsWith("reference") ?? false;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-auto">
        <FieldLabel htmlFor={`${id}-type`}>{t("kind.label")}</FieldLabel>
        <NativeSelect
          id={`${id}-type`}
          value={type}
          onChange={(event) =>
            onChange({ type: event.target.value as NoteType })
          }
        >
          {NOTE_TYPES.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {t(`types.${option}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {type === "quote" ? (
        <Field
          className="w-auto"
          data-invalid={referenceInvalid ? true : undefined}
        >
          <FieldLabel htmlFor={`${id}-reference`}>
            {t("kind.reference")}
          </FieldLabel>
          <Input
            id={`${id}-reference`}
            value={reference}
            maxLength={NOTE_REFERENCE_MAX}
            placeholder={t("kind.referencePlaceholder")}
            aria-invalid={referenceInvalid ? true : undefined}
            onChange={(event) => onChange({ reference: event.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}

// The note being written: its latest document and kind, sent whole on every change once there is a
// document (a kind alone is not a note yet).
function useDraft(
  initial: { content?: unknown; type: NoteType; reference: string },
  schedule: (draft: NoteDraft) => void,
) {
  const draft = useRef(initial);
  const [kind, setKind] = useState({
    type: initial.type,
    reference: initial.reference,
  });
  function change(patch: {
    content?: unknown;
    type?: NoteType;
    reference?: string;
  }) {
    draft.current = { ...draft.current, ...patch };
    setKind({ type: draft.current.type, reference: draft.current.reference });
    if (draft.current.content !== undefined) {
      schedule({
        content: draft.current.content,
        type: draft.current.type,
        reference:
          draft.current.type === "quote" ? draft.current.reference : undefined,
      });
    }
  }
  return { kind, change };
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
  const draft = useDraft(
    { type: "key_concept", reference: "" },
    autosave.schedule,
  );
  const failedKey =
    autosave.status.kind === "failed" ? autosave.status.errorKey : undefined;

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
      <KindFields
        type={draft.kind.type}
        reference={draft.kind.reference}
        errorKey={failedKey}
        onChange={draft.change}
      />
      <span aria-hidden="true" className="text-sm font-medium">
        {t("add.label")}
      </span>
      <NoteEditor
        label={t("add.label")}
        autoFocus
        invalid={failedKey !== undefined && !failedKey.startsWith("reference")}
        describedBy={`${id}-status`}
        onUpdate={(content) => draft.change({ content })}
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
          <KindBadge note={note} />
          {note.view}
          <div className="flex flex-wrap gap-2">
            {note.type === "action_or_question" ? (
              <ResolveButton
                note={note}
                date={created}
                resolve={actions.resolve}
                announce={announce}
              />
            ) : null}
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
  const draft = useDraft(
    {
      content: note.content,
      type: note.type,
      reference: note.reference ?? "",
    },
    autosave.schedule,
  );
  const failedKey =
    autosave.status.kind === "failed" ? autosave.status.errorKey : undefined;

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
      <KindFields
        type={draft.kind.type}
        reference={draft.kind.reference}
        errorKey={failedKey}
        onChange={draft.change}
      />
      <NoteEditor
        label={t("edit.label")}
        initialContent={note.content}
        autoFocus
        invalid={failedKey !== undefined && !failedKey.startsWith("reference")}
        describedBy={`${id}-status`}
        onUpdate={(content) => draft.change({ content })}
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

// Marks an action or question as resolved, or opens it again (US-020).
function ResolveButton({
  note,
  date,
  resolve,
  announce,
}: Readonly<{
  note: NotebookNote;
  date: string;
  resolve: NotebookActions["resolve"];
  announce: (message: string) => void;
}>) {
  const t = useTranslations("notes");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<NoteErrorKey>();
  const resolved = note.resolvedAt !== null;

  async function toggle() {
    setPending(true);
    setErrorKey(undefined);
    const result = await resolve(note.id, !resolved);
    setPending(false);
    if (!result.ok) {
      setErrorKey(result.errorKey);
      return;
    }
    announce(t(resolved ? "resolve.reopened" : "resolve.marked"));
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={t(resolved ? "resolve.reopenFor" : "resolve.markFor", {
          date,
        })}
        onClick={() => void toggle()}
      >
        {t(resolved ? "resolve.reopen" : "resolve.mark")}
      </Button>
      {errorKey ? (
        <p role="alert" className="text-destructive basis-full text-sm">
          {t(`errors.${errorKey}`)}
        </p>
      ) : null}
    </>
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
