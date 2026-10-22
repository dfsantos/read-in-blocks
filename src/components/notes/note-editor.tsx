"use client";

import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";
import {
  BoldIcon,
  CodeIcon,
  Heading3Icon,
  Heading4Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  SquareCodeIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useLocale,
  useMessages,
  useTimeZone,
  useTranslations,
} from "next-intl";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { codeBlockView } from "@/components/notes/code-block-view";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  DIAGRAM_LANGUAGE,
  isCodeBlockLanguage,
  isSafeHref,
  NOTE_LANGUAGES,
  type NoteDoc,
} from "@/domain/notes/rich-text";
import { noteExtensions } from "@/lib/note-extensions";

// The rich-text editor of a note (US-019, ADR-0007): Tiptap with the notebook's extensions, a
// toolbar of shadcn buttons and the standard shortcuts. Loaded on demand (next/dynamic) only when
// the reader writes, so reading pages never download it. Pasted HTML goes through the editor's
// schema: anything it does not know (scripts, images, styles, event handlers) is dropped, and
// links outside http(s)/mailto are refused (isAllowedUri). The server validates again.

export type NoteEditorProps = Readonly<{
  // Accessible name of the writing area.
  label: string;
  initialContent?: NoteDoc;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onUpdate: (content: JSONContent) => void;
  // Ctrl/Cmd+Enter, to save without leaving the keyboard.
  onSubmit?: () => void;
}>;

export default function NoteEditor({
  label,
  initialContent,
  autoFocus,
  invalid,
  describedBy,
  onUpdate,
  onSubmit,
}: NoteEditorProps) {
  // The editor is created once: callbacks and ARIA state are read through refs and an effect.
  const callbacks = useRef({ onUpdate, onSubmit });
  useEffect(() => {
    callbacks.current = { onUpdate, onSubmit };
  });
  const attributes = (): Record<string, string> => ({
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": label,
    ...(invalid ? { "aria-invalid": "true" } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    class: "note-content min-h-32 px-3 py-2 text-sm outline-none break-words",
  });

  // A diagram's preview is rendered outside this React tree: it gets the same translations.
  const intl = {
    locale: useLocale(),
    messages: useMessages(),
    timeZone: useTimeZone(),
  };

  const editor = useEditor({
    extensions: noteExtensions({ codeBlockView: codeBlockView(intl) }),
    content: initialContent,
    // Next.js renders on the server first; the editor only exists in the browser.
    immediatelyRender: false,
    // The page's CSP only allows styles with its nonce: the base styles live in globals.css.
    injectCSS: false,
    // The editor arrives a moment after the form (next/dynamic): it only takes the focus if the
    // reader has not moved it meanwhile (to the kind or the page of a quote, for instance).
    autofocus: false,
    // Checked and done at once: Tiptap's focus command waits a frame, long enough to lose a key.
    onCreate: ({ editor: created }) => {
      const active = document.activeElement;
      if (!autoFocus || (active !== null && active !== document.body)) return;
      const { view } = created;
      view.dispatch(
        view.state.tr.setSelection(Selection.atEnd(view.state.doc)),
      );
      view.focus();
    },
    editorProps: {
      attributes: attributes(),
      handleKeyDown: (_view, event) => {
        const submit = callbacks.current.onSubmit;
        if (
          submit &&
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey)
        ) {
          submit();
          return true;
        }
        return false;
      },
    },
    // ProseMirror keeps attributes in objects without a prototype, which a Server Action's
    // arguments silently drop (a heading would lose its level): only plain JSON leaves the editor.
    onUpdate: ({ editor: current }) =>
      callbacks.current.onUpdate(
        JSON.parse(JSON.stringify(current.getJSON())) as JSONContent,
      ),
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: attributes() },
    });
    // attributes() only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, label, invalid, describedBy]);

  return (
    <div
      data-invalid={invalid ? true : undefined}
      className="border-input focus-within:border-ring focus-within:ring-ring/50 data-[invalid]:border-destructive rounded-lg border focus-within:ring-3"
    >
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

type Tool = Readonly<{
  key:
    | "bold"
    | "italic"
    | "heading"
    | "subheading"
    | "bulletList"
    | "orderedList"
    | "blockquote"
    | "code"
    | "codeBlock";
  icon: LucideIcon;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}>;

const TOOLS: readonly Tool[] = [
  {
    key: "bold",
    icon: BoldIcon,
    active: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    key: "italic",
    icon: ItalicIcon,
    active: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    key: "heading",
    icon: Heading3Icon,
    active: (editor) => editor.isActive("heading", { level: 3 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: "subheading",
    icon: Heading4Icon,
    active: (editor) => editor.isActive("heading", { level: 4 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
  },
  {
    key: "bulletList",
    icon: ListIcon,
    active: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: "orderedList",
    icon: ListOrderedIcon,
    active: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    key: "blockquote",
    icon: QuoteIcon,
    active: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "code",
    icon: CodeIcon,
    active: (editor) => editor.isActive("code"),
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    key: "codeBlock",
    icon: SquareCodeIcon,
    active: (editor) =>
      editor.isActive("codeBlock") &&
      editor.getAttributes("codeBlock").language !== DIAGRAM_LANGUAGE,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

// A click on a toolbar button keeps the focus (and the selection) in the editor. Otherwise the
// button holds it until the editor takes it back on the next frame, and keys typed in between land
// on the button (a space would press it again).
const keepEditorFocus = (event: MouseEvent) => event.preventDefault();

function Toolbar({ editor }: Readonly<{ editor: Editor }>) {
  const t = useTranslations("notes.editor");
  const [linkOpen, setLinkOpen] = useState(false);
  // Re-renders only when what the toolbar shows changes (Tiptap v3 does not re-render on every
  // transaction).
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: Object.fromEntries(
        TOOLS.map((tool) => [tool.key, tool.active(current)]),
      ) as Record<Tool["key"], boolean>,
      link: current.isActive("link"),
      diagram: current.isActive("codeBlock", { language: DIAGRAM_LANGUAGE }),
      language: current.isActive("codeBlock")
        ? ((current.getAttributes("codeBlock").language as unknown) ?? null)
        : undefined,
    }),
  });

  return (
    <div className="flex flex-col gap-2 border-b p-1">
      <div
        role="toolbar"
        aria-label={t("toolbar")}
        className="flex flex-wrap items-center gap-0.5"
      >
        {TOOLS.map((tool) => (
          <Button
            key={tool.key}
            type="button"
            size="icon-sm"
            variant={state.active[tool.key] ? "secondary" : "ghost"}
            aria-label={t(tool.key)}
            aria-pressed={state.active[tool.key]}
            title={t(tool.key)}
            onMouseDown={keepEditorFocus}
            onClick={() => tool.run(editor)}
          >
            <tool.icon aria-hidden="true" />
          </Button>
        ))}
        <Button
          type="button"
          size="icon-sm"
          variant={state.diagram ? "secondary" : "ghost"}
          aria-label={t("diagram")}
          aria-pressed={state.diagram}
          title={t("diagram")}
          onMouseDown={keepEditorFocus}
          onClick={() => {
            if (state.diagram) {
              editor.chain().focus().toggleCodeBlock().run();
              return;
            }
            // A starting diagram the reader edits; the preview appears below it.
            editor
              .chain()
              .focus()
              .insertContent({
                type: "codeBlock",
                attrs: { language: DIAGRAM_LANGUAGE },
                content: [{ type: "text", text: t("diagramTemplate") }],
              })
              .run();
          }}
        >
          <WorkflowIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={state.link || linkOpen ? "secondary" : "ghost"}
          aria-label={t("link")}
          aria-pressed={state.link}
          aria-expanded={linkOpen}
          title={t("link")}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <LinkIcon aria-hidden="true" />
        </Button>
        {state.language !== undefined ? (
          <NativeSelect
            size="sm"
            aria-label={t("language")}
            className="ml-1"
            value={
              isCodeBlockLanguage(state.language) ? state.language : "plaintext"
            }
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", {
                  language:
                    event.target.value === "plaintext"
                      ? null
                      : event.target.value,
                })
                .run()
            }
          >
            <NativeSelectOption value="plaintext">
              {t("languages.plaintext")}
            </NativeSelectOption>
            {NOTE_LANGUAGES.map((language) => (
              <NativeSelectOption key={language} value={language}>
                {t(`languages.${language}`)}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value={DIAGRAM_LANGUAGE}>
              {t("languages.mermaid")}
            </NativeSelectOption>
          </NativeSelect>
        ) : null}
      </div>
      {linkOpen ? (
        <LinkForm
          editor={editor}
          initialHref={
            (editor.getAttributes("link").href as string | undefined) ?? ""
          }
          close={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  );
}

// Sets, changes or removes the link of the selection. Only http(s) and mailto, like the server; an
// address typed without a scheme gets https://.
function LinkForm({
  editor,
  initialHref,
  close,
}: Readonly<{ editor: Editor; initialHref: string; close: () => void }>) {
  const t = useTranslations("notes");
  const id = useId();
  const [href, setHref] = useState(initialHref);
  const [invalid, setInvalid] = useState(false);

  function apply(event: FormEvent) {
    event.preventDefault();
    const trimmed = href.trim();
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    if (!isSafeHref(candidate)) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing selected: the address itself becomes the link's text.
      chain
        .insertContent({
          type: "text",
          text: candidate,
          marks: [{ type: "link", attrs: { href: candidate } }],
        })
        .run();
    } else {
      chain.setLink({ href: candidate }).run();
    }
    close();
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    close();
  }

  // A form inside the note's form would be invalid HTML: a group submitted by its own button.
  return (
    <div
      role="group"
      aria-label={t("editor.link")}
      className="flex flex-col gap-2 px-1 pb-1"
    >
      <Field data-invalid={invalid ? true : undefined}>
        <FieldLabel htmlFor={`${id}-href`}>
          {t("editor.linkForm.label")}
        </FieldLabel>
        <Input
          id={`${id}-href`}
          type="url"
          inputMode="url"
          value={href}
          autoFocus
          placeholder={t("editor.linkForm.placeholder")}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            setHref(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply(event);
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />
        {invalid ? (
          <FieldError id={`${id}-error`}>{t("errors.invalidLink")}</FieldError>
        ) : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={apply}>
          {t("editor.linkForm.apply")}
        </Button>
        {editor.isActive("link") ? (
          <Button type="button" size="sm" variant="ghost" onClick={remove}>
            {t("editor.linkForm.remove")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          {t("editor.linkForm.cancel")}
        </Button>
      </div>
    </div>
  );
}
