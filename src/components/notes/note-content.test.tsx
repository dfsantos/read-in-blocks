import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NoteDoc } from "@/domain/notes/rich-text";

import messages from "../../../messages/pt-BR.json";
import { NoteContent } from "./note-content";

const renderDiagram = vi.hoisted(() => vi.fn());
vi.mock("./diagram-renderer", () => ({ renderDiagram }));

const doc = (...content: NoteDoc["content"]): NoteDoc => ({
  type: "doc",
  content,
});

describe("NoteContent", () => {
  afterEach(cleanup);

  it("renders every node and mark of the schema as elements", () => {
    const { container } = render(
      <NoteContent
        content={doc(
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Título" }],
          },
          {
            type: "heading",
            attrs: { level: 4 },
            content: [{ type: "text", text: "Sub" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "forte", marks: [{ type: "bold" }] },
              { type: "hardBreak" },
              { type: "text", text: "leve", marks: [{ type: "italic" }] },
              { type: "text", text: "f()", marks: [{ type: "code" }] },
              {
                type: "text",
                text: "site",
                marks: [{ type: "link", attrs: { href: "https://a.b/" } }],
              },
            ],
          },
          { type: "paragraph" },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "um" }],
                  },
                ],
              },
            ],
          },
          {
            type: "orderedList",
            attrs: { start: 4 },
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "quatro" }],
                  },
                ],
              },
            ],
          },
          {
            type: "blockquote",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "dito" }] },
            ],
          },
        )}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Título" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "Sub" }),
    ).toBeInTheDocument();
    expect(screen.getByText("forte").tagName).toBe("STRONG");
    expect(screen.getByText("leve").tagName).toBe("EM");
    expect(screen.getByText("f()").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("href", "https://a.b/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(container.querySelector("ul > li")).toHaveTextContent("um");
    expect(container.querySelector("ol")).toHaveAttribute("start", "4");
    expect(container.querySelector("blockquote")).toHaveTextContent("dito");
    expect(container.querySelectorAll("br")).toHaveLength(2);
  });

  it("highlights a code block with its language, as text", () => {
    const { container } = render(
      <NoteContent
        content={doc({
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [
            { type: "text", text: 'const a = "<img src=x onerror=alert(1)>";' },
          ],
        })}
      />,
    );

    const code = container.querySelector("pre > code.hljs.language-typescript");
    expect(code).toHaveTextContent('const a = "<img src=x onerror=alert(1)>";');
    expect(code?.querySelector(".hljs-keyword")).toHaveTextContent("const");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows a code block without a language as plain code", () => {
    const { container } = render(
      <NoteContent
        content={doc({
          type: "codeBlock",
          attrs: { language: null },
          content: [{ type: "text", text: "if x then y" }],
        })}
      />,
    );

    const code = container.querySelector("pre > code");
    expect(code).toHaveTextContent("if x then y");
    expect(code?.children).toHaveLength(0);
  });

  it("keeps markup typed by the reader as text", () => {
    const { container } = render(
      <NoteContent
        content={doc({
          type: "paragraph",
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        })}
      />,
    );

    expect(container).toHaveTextContent("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("draws a diagram block in the browser and leaves the rest of the note alone", async () => {
    renderDiagram.mockResolvedValue({ ok: false, reason: "syntax" });
    const { container } = render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <NoteContent
          content={doc(
            { type: "paragraph", content: [{ type: "text", text: "Antes" }] },
            {
              type: "codeBlock",
              attrs: { language: "mermaid" },
              content: [{ type: "text", text: "flowchart LR\n  A -->" }],
            },
            { type: "paragraph", content: [{ type: "text", text: "Depois" }] },
          )}
        />
      </NextIntlClientProvider>,
    );

    expect(
      await screen.findByText(/Não foi possível desenhar este diagrama/),
    ).toBeInTheDocument();
    expect(renderDiagram).toHaveBeenCalledWith(
      "flowchart LR\n  A -->",
      expect.any(AbortSignal),
    );
    expect(container).toHaveTextContent("Antes");
    expect(container).toHaveTextContent("Depois");
    expect(container.querySelector(".hljs-keyword")).toBeNull();
  });
});
