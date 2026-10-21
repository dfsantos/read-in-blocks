import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { parseNoteContent } from "@/domain/notes/rich-text";

import { noteExtensions } from "./note-extensions";

// What the editor keeps from pasted or loaded HTML (US-019): only the notebook's schema survives.
// Known XSS payloads (OWASP cheat sheet) go through the same parser as a paste.

// jsdom has no ClipboardEvent; ProseMirror only needs one to dispatch a paste.
globalThis.ClipboardEvent ??= class extends Event {
  clipboardData = null;
} as unknown as typeof ClipboardEvent;

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function load(html: string) {
  editor = new Editor({
    extensions: noteExtensions(),
    content: html,
    injectCSS: false,
  });
  return editor.getJSON();
}

function paste(html: string) {
  editor = new Editor({ extensions: noteExtensions(), injectCSS: false });
  editor.view.pasteHTML(html);
  return editor.getJSON();
}

describe("noteExtensions", () => {
  it.each([
    ["a script", "<p>a</p><script>alert(1)</script>"],
    ["an image with onerror", '<p>a<img src="x" onerror="alert(1)"></p>'],
    ["an svg with onload", '<p>a</p><svg onload="alert(1)"><circle/></svg>'],
    ["an iframe", '<p>a</p><iframe src="javascript:alert(1)"></iframe>'],
    [
      "inline handlers and styles",
      '<p onclick="alert(1)" style="color:red">a</p>',
    ],
    ["a javascript: link", '<p><a href="javascript:alert(1)">a</a></p>'],
    [
      "an encoded javascript: link",
      '<p><a href="jav&#x09;ascript:alert(1)">a</a></p>',
    ],
    [
      "a data: link",
      '<p><a href="data:text/html,<script>alert(1)</script>">a</a></p>',
    ],
    ["a form", '<form action="https://evil"><input value="x"></form><p>a</p>'],
  ])("neutralizes %s", (_name, html) => {
    for (const json of [load(html), paste(html)]) {
      const serialized = JSON.stringify(json);
      expect(serialized).not.toMatch(
        /script|onerror|onload|onclick|iframe|javascript|data:|style|img|svg|form/i,
      );
      // And the result is something the server accepts.
      expect(parseNoteContent(json)).toMatchObject({ ok: true });
    }
  });

  it("keeps the formatting the notebook offers from pasted HTML", () => {
    const json = paste(
      '<h3>T</h3><p><strong>b</strong> <em>i</em> <code>c</code> <a href="https://a.b">l</a></p>' +
        "<ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol><blockquote><p>q</p></blockquote>" +
        '<pre><code class="language-python">print(1)</code></pre>',
    );
    const parsed = parseNoteContent(json);
    expect(parsed.ok).toBe(true);
    expect(JSON.stringify(json)).toContain('"href":"https://a.b"');
    expect(JSON.stringify(json)).toContain('"language":"python"');
    for (const type of [
      "heading",
      "bulletList",
      "orderedList",
      "blockquote",
      "codeBlock",
      "bold",
      "italic",
      "code",
      "link",
    ]) {
      expect(JSON.stringify(json)).toContain(`"type":"${type}"`);
    }
  });

  it("turns headings the notebook does not offer into what it does", () => {
    const json = paste("<h1>Grande</h1><p>a</p>");
    expect(JSON.stringify(json)).not.toContain('"level":1');
    expect(parseNoteContent(json).ok).toBe(true);
  });
});
