import { createLowlight } from "lowlight";

import { noteGrammars } from "@/lib/note-grammars";
import { Fragment, type ReactNode } from "react";

import { NoteDiagram } from "@/components/notes/note-diagram";
import {
  DIAGRAM_LANGUAGE,
  type NoteBlock,
  type NoteDoc,
  type NoteInline,
  type NoteListItem,
} from "@/domain/notes/rich-text";

// The read-only view of a note (US-019, ADR-0007): the same schema as the editor, rendered as React
// elements, never as HTML (no dangerouslySetInnerHTML anywhere). Text is escaped by React; links
// were already checked (http, https or mailto) and open in a new tab without the opener. Runs on
// the server: the page passes the result to the notebook, so reading a note downloads neither the
// editor nor the highlighter. Diagrams (US-022) are the exception: drawn in the browser, on demand.

const lowlight = createLowlight(noteGrammars());

type HastNode =
  | { type: "text"; value: string }
  | {
      type: "element";
      properties?: { className?: unknown };
      children: HastNode[];
    }
  | { type: string; children?: HastNode[] };

// lowlight's tree only holds spans with highlight.js classes and text; anything else is skipped.
function renderHast(nodes: readonly HastNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "text" && "value" in node) return node.value;
    if (node.type === "element" && "children" in node && node.children) {
      const className = (node as { properties?: { className?: unknown } })
        .properties?.className;
      return (
        <span
          key={index}
          className={Array.isArray(className) ? className.join(" ") : undefined}
        >
          {renderHast(node.children)}
        </span>
      );
    }
    return null;
  });
}

function renderInline(content: readonly NoteInline[] | undefined): ReactNode {
  return (content ?? []).map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    let element: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold":
          element = <strong>{element}</strong>;
          break;
        case "italic":
          element = <em>{element}</em>;
          break;
        case "code":
          element = <code>{element}</code>;
          break;
        case "link":
          element = (
            <a
              href={mark.attrs.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {element}
            </a>
          );
          break;
      }
    }
    return <Fragment key={index}>{element}</Fragment>;
  });
}

function renderListItem(item: NoteListItem, index: number): ReactNode {
  return <li key={index}>{item.content.map(renderBlock)}</li>;
}

function renderBlock(node: NoteBlock, index: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <p key={index}>
          {node.content?.length ? renderInline(node.content) : <br />}
        </p>
      );
    case "heading": {
      const Heading = node.attrs.level === 3 ? "h3" : "h4";
      return <Heading key={index}>{renderInline(node.content)}</Heading>;
    }
    case "blockquote":
      return (
        <blockquote key={index}>{node.content.map(renderBlock)}</blockquote>
      );
    case "bulletList":
      return <ul key={index}>{node.content.map(renderListItem)}</ul>;
    case "orderedList":
      return (
        <ol key={index} start={node.attrs.start}>
          {node.content.map(renderListItem)}
        </ol>
      );
    case "codeBlock": {
      const code = (node.content ?? []).map((part) => part.text).join("");
      const language = node.attrs.language;
      if (language === DIAGRAM_LANGUAGE) {
        return <NoteDiagram key={index} source={code} showSource />;
      }
      return (
        <pre key={index} data-language={language ?? undefined}>
          <code className={language ? `hljs language-${language}` : "hljs"}>
            {language
              ? renderHast(lowlight.highlight(language, code).children)
              : code}
          </code>
        </pre>
      );
    }
  }
}

export function NoteContent({ content }: Readonly<{ content: NoteDoc }>) {
  return (
    <div className="note-content text-sm break-words">
      {content.content.map(renderBlock)}
    </div>
  );
}
