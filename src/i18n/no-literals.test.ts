import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.join(process.cwd(), "src");
// shadcn/ui primitives are generated and carry no user-facing text.
const IGNORED = [path.join(srcDir, "components", "ui")];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (IGNORED.includes(full)) return [];
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

/** Lines with UI text outside the catalog: accented letters or JSX text. */
export function findUiLiterals(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");

  return withoutComments.split("\n").flatMap((line, index) => {
    const accented = /[À-ÿ]/.test(line);
    // Text between JSX tags, e.g. <h1>Title</h1> or <p>Some words</p>.
    const jsxText = />\s*[A-Za-zÀ-ÿ][^<>{}]*[A-Za-zÀ-ÿ.!?:]\s*</.test(line);
    // Literal values of text-bearing attributes, e.g. aria-label="Close".
    const textAttr =
      /\b(?:aria-label|placeholder|title|alt)=["'][^"']*[A-Za-z]/.test(line);
    return accented || jsxText || textAttr
      ? [`${index + 1}: ${line.trim()}`]
      : [];
  });
}

describe("UI literals", () => {
  it("detects literals (sanity check of the detector)", () => {
    expect(findUiLiterals("<h1>Olá mundo</h1>")).toHaveLength(1);
    expect(findUiLiterals("<p>Read more</p>")).toHaveLength(1);
    expect(findUiLiterals('<input aria-label="Close" />')).toHaveLength(1);
    expect(findUiLiterals("<h1>{t('title')}</h1>")).toHaveLength(0);
    expect(findUiLiterals("<a aria-label={t('close')} />")).toHaveLength(0);
    expect(findUiLiterals("// Comentário: ação")).toHaveLength(0);
  });

  it("finds no UI text in src/ outside messages/", () => {
    const offenders = sourceFiles(srcDir).flatMap((file) =>
      findUiLiterals(readFileSync(file, "utf-8")).map(
        (hit) => `${path.relative(srcDir, file)}:${hit}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
