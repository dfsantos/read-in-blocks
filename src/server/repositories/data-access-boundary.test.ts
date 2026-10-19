// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Architecture test for the data-access boundary (US-006, ADR-0008): the lint rule in
// eslint.config.mjs must refuse database imports outside src/db and src/server/repositories,
// whatever form the import takes.

const eslint = new ESLint({ cwd: process.cwd() });

async function boundaryErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.line);
}

const forbiddenImports = [
  'import { getDb } from "@/db/client";',
  'import type { Database } from "@/db/client";',
  'import * as schema from "@/db/schema";',
  'import { session } from "@/db/auth-schema";',
  'import { getDb } from "../../db/client";',
  'import { getDb } from "../db";',
  'export { getDb } from "@/db/client";',
  'export * from "@/db/schema";',
  'import { eq } from "drizzle-orm";',
  'import { drizzle } from "drizzle-orm/node-postgres";',
  'import { Pool } from "pg";',
];

describe("data-access boundary", () => {
  describe.each([
    "src/app/[locale]/(app)/page.tsx",
    "src/components/library/book-card.tsx",
    "src/server/actions/books.ts",
    "src/lib/utils.ts",
    "src/domain/progress.ts",
  ])("outside the data layer (%s)", (filePath) => {
    it.each(forbiddenImports)("refuses %s", async (code) => {
      expect(await boundaryErrors(code, filePath)).toEqual([1]);
    });
  });

  it.each([
    "src/server/repositories/books.ts",
    "src/db/health.ts",
    "src/server/auth/index.ts",
  ])(
    "allows the data layer and its documented exceptions (%s)",
    async (filePath) => {
      expect(
        await boundaryErrors(forbiddenImports.join("\n"), filePath),
      ).toEqual([]);
    },
  );

  it("allows importing repositories from actions and pages", async () => {
    expect(
      await boundaryErrors(
        'import { listSessions } from "@/server/repositories/sessions";',
        "src/server/actions/sessions.ts",
      ),
    ).toEqual([]);
  });

  // The rule only sees static imports; dynamic import() and require() would slip past it.
  it("is not bypassed with dynamic import or require in application code", () => {
    const srcDir = path.join(process.cwd(), "src");
    const allowed = /^(db|server\/repositories)\//;
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
      });
    })(srcDir);

    const offenders = files.filter((file) => {
      const relative = path.relative(srcDir, file).split(path.sep).join("/");
      if (allowed.test(relative)) return false;
      return /(\bimport|\brequire)\s*\(\s*["'`][^"'`]*(\bdb\/|\bdb["'`]|drizzle-orm|\bpg\b)/.test(
        readFileSync(file, "utf-8"),
      );
    });
    expect(offenders).toEqual([]);
  });
});
