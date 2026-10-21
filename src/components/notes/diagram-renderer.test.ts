import { describe, expect, it } from "vitest";

import { renderDiagram, svgToImage } from "./diagram-renderer";

// What Mermaid returns becomes an image's source: the size comes from the viewBox, and anything able
// to run or fetch is removed, even though an image runs nothing (US-022).

const decode = (src: string) =>
  decodeURIComponent(src.replace("data:image/svg+xml;charset=utf-8,", ""));

const svg = (inner: string, attributes = 'viewBox="0 0 120.5 40"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="d1" width="100%" style="max-width: 120px;" ${attributes}>${inner}</svg>`;

describe("svgToImage", () => {
  it("sizes the image from the viewBox and keeps the drawing", () => {
    const image = svgToImage(
      svg("<style>#d1{fill:red}</style><g><text>Ideia</text></g>"),
    );
    expect(image).toMatchObject({ width: 121, height: 40, title: null });
    const source = decode(image!.src);
    expect(source).toContain('width="120.5"');
    expect(source).toContain('height="40"');
    expect(source).not.toContain("max-width");
    expect(source).toContain("<text>Ideia</text>");
    expect(source).toContain("<style>");
  });

  it("uses the diagram's accessible title", () => {
    expect(svgToImage(svg("<title>Fluxo da leitura</title><g/>"))?.title).toBe(
      "Fluxo da leitura",
    );
  });

  it("removes scripts, event handlers and outside links", () => {
    const image = svgToImage(
      svg(
        '<script>window.pwned = 1</script><g onclick="window.pwned = 1"><a href="javascript:alert(1)"><text>x</text></a><use xlink:href="https://evil.test/x.svg#a"/><use href="#marker"/></g><foreignObject><iframe src="https://evil.test"></iframe></foreignObject>',
        'viewBox="0 0 10 10" onload="window.pwned = 1"',
      ),
    );
    const source = decode(image!.src);
    expect(source).not.toMatch(/script|onclick|onload|javascript|evil|iframe/);
    expect(source).toContain('href="#marker"');
  });

  it.each([
    ["markup that is not SVG", "<div>x</div>"],
    ["broken markup", "<svg"],
    ["an SVG without a viewBox", svg("<g/>", "")],
    ["an empty viewBox", svg("<g/>", 'viewBox="0 0 0 10"')],
  ])("refuses %s", (_name, markup) => {
    expect(svgToImage(markup)).toBeNull();
  });
});

describe("renderDiagram", () => {
  it("skips a drawing nobody wants anymore, without loading Mermaid", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      renderDiagram("flowchart LR\n  A --> B", cancelled.signal),
    ).resolves.toBeNull();
  });
});
