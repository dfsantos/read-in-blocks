import type { Mermaid, MermaidConfig } from "mermaid";

import { NOTE_TEXT_MAX } from "@/domain/notes/rich-text";

// Draws a note's diagram (US-022, RF-012, ADR-0007) in the browser. Mermaid is only downloaded the
// first time a diagram is drawn. The SVG it produces is never inserted into the page: it becomes the
// source of an <img>, a separate document where no script runs, no event handler fires and nothing
// is fetched, whatever the diagram's text managed to put in it. That also keeps the page's CSP
// intact (US-028): the diagram's own <style> applies inside the image, not to the page.

export type DiagramImage = Readonly<{
  src: string;
  width: number;
  height: number;
  // The diagram's accessible title (Mermaid's `accTitle`), when it has one.
  title: string | null;
}>;

export type DiagramResult =
  | Readonly<{ ok: true; image: DiagramImage }>
  // `syntax`: Mermaid could not read the text; `unavailable`: Mermaid itself failed to load or draw.
  | Readonly<{ ok: false; reason: "syntax" | "unavailable" }>;

// Mermaid measures text in the page while it lays a diagram out: the measuring box and the image
// use the same font, so labels fit.
const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
const FONT_SIZE = "16px";

const CONFIG: MermaidConfig = {
  startOnLoad: false,
  // Labels are text, links and click handlers are disabled (the story's requirement).
  securityLevel: "strict",
  // Errors are shown by the notebook, never as Mermaid's own error diagram.
  suppressErrorRendering: true,
  maxTextSize: NOTE_TEXT_MAX,
  // SVG text instead of HTML inside foreignObject.
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  theme: "neutral",
  fontFamily: FONT_FAMILY,
  themeVariables: { fontFamily: FONT_FAMILY, fontSize: FONT_SIZE },
  // A note's text is the reader's content: nothing of it reaches the console.
  logLevel: "fatal",
  // What a diagram's own directives or front matter can never change.
  secure: [
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "maxEdges",
    "suppressErrorRendering",
    "htmlLabels",
    "flowchart",
    "theme",
    "themeVariables",
    "themeCSS",
    "fontFamily",
    "darkMode",
    "logLevel",
  ],
};

let mermaid: Promise<Mermaid> | undefined;

function loadMermaid(): Promise<Mermaid> {
  if (!mermaid) {
    mermaid = import("mermaid").then(({ default: loaded }) => {
      loaded.initialize(CONFIG);
      return loaded;
    });
    // A failed download can be retried by the next diagram.
    mermaid.catch(() => {
      mermaid = undefined;
    });
  }
  return mermaid;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Turns Mermaid's SVG into an image source. The image already cannot run anything; scripts, event
// handlers and outside references are removed anyway (defense in depth). The size comes from the
// viewBox: Mermaid's own width="100%" means nothing outside the page it was drawn in.
export function svgToImage(svg: string): DiagramImage | null {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.namespaceURI !== SVG_NS || root.localName !== "svg") return null;
  if (parsed.getElementsByTagName("parsererror").length > 0) return null;

  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (["script", "iframe", "embed", "object"].includes(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const isLink = name === "href" || name.endsWith(":href");
      if (
        name.startsWith("on") ||
        (isLink && !attribute.value.trim().startsWith("#"))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  for (const attribute of Array.from(root.attributes)) {
    if (attribute.name.toLowerCase().startsWith("on")) {
      root.removeAttribute(attribute.name);
    }
  }

  const box = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [width, height] = [box[2], box[3]];
  if (
    box.length !== 4 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.removeAttribute("style");

  const title =
    Array.from(root.children)
      .find((child) => child.localName === "title")
      ?.textContent?.trim() || null;

  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      new XMLSerializer().serializeToString(root),
    )}`,
    width: Math.ceil(width),
    height: Math.ceil(height),
    title,
  };
}

let sequence = 0;

async function draw(source: string): Promise<DiagramResult> {
  if (source.trim().length === 0 || source.length > NOTE_TEXT_MAX) {
    return { ok: false, reason: "syntax" };
  }
  let loaded: Mermaid;
  try {
    loaded = await loadMermaid();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  try {
    if (!(await loaded.parse(source, { suppressErrors: true }))) {
      return { ok: false, reason: "syntax" };
    }
  } catch {
    return { ok: false, reason: "syntax" };
  }

  // An invisible box, out of view, where Mermaid measures and lays out. Styled through the CSSOM,
  // which the page's CSP allows (a style attribute would not be).
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1000px",
    visibility: "hidden",
    pointerEvents: "none",
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
  });
  document.body.append(host);
  try {
    sequence += 1;
    const { svg } = await loaded.render(
      `note-diagram-${sequence}`,
      source,
      host,
    );
    const image = svgToImage(svg);
    return image ? { ok: true, image } : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "syntax" };
  } finally {
    host.remove();
  }
}

// Mermaid keeps global state while it draws: diagrams are drawn one at a time, in order.
let queue: Promise<unknown> = Promise.resolve();

export function renderDiagram(source: string): Promise<DiagramResult> {
  const result = queue.then(() => draw(source));
  queue = result.catch(() => undefined);
  return result;
}
