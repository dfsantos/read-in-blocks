import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findMissingKeys } from "./messages";
import { routing } from "./routing";

const messagesDir = path.join(process.cwd(), "messages");

function loadCatalogs(): Record<string, unknown> {
  return Object.fromEntries(
    readdirSync(messagesDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => [
        path.basename(file, ".json"),
        JSON.parse(readFileSync(path.join(messagesDir, file), "utf-8")),
      ]),
  );
}

describe("message catalogs", () => {
  it("has a catalog for every registered locale, and only those", () => {
    expect(Object.keys(loadCatalogs()).sort()).toEqual(
      [...routing.locales].sort(),
    );
  });

  it("has the same keys in every locale", () => {
    expect(findMissingKeys(loadCatalogs())).toEqual({});
  });

  it("detects an incomplete locale", () => {
    const missing = findMissingKeys({
      "pt-BR": { a: { b: "x", c: "y" }, d: "z" },
      en: { a: { b: "x" } },
    });

    expect(missing).toEqual({ en: ["a.c", "d"] });
  });
});
