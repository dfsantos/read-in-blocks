// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { is } from "drizzle-orm";
import { PgDatabase, PgTable } from "drizzle-orm/pg-core";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { getDb } from "@/db/client";

// Architecture test for the data-access boundary (US-006, ADR-0008): the lint rules in
// eslint.config.mjs must refuse database access outside src/db and src/server/repositories,
// whatever form it takes, and the repositories must not hand the database to their callers.

const eslint = new ESLint({ cwd: process.cwd() });
const srcDir = path.join(process.cwd(), "src");
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

async function boundaryErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter(
      (message) =>
        message.ruleId === "no-restricted-imports" ||
        message.ruleId === "no-restricted-syntax",
    )
    .map((message) => message.line)
    .filter((line, index, lines) => lines.indexOf(line) === index);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE.test(entry.name) ? [full] : [];
  });
}

function relativeToSrc(file: string): string {
  return path.relative(srcDir, file).split(path.sep).join("/");
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
  'import Pool from "pg-pool";',
  'import postgres from "postgres";',
  'import { neon } from "@neondatabase/serverless";',
  'import { sql } from "@vercel/postgres";',
];

const authInstanceUses = [
  'import { getAuth } from "@/server/auth";',
  'import { createAuth } from "@/server/auth/index";',
  'import { getAuth } from "../auth";',
  "const adapter = auth.$context;",
];

describe("data-access boundary", () => {
  describe.each([
    "src/app/[locale]/(app)/page.tsx",
    "src/components/library/book-card.tsx",
    "src/server/actions/books.ts",
    "src/lib/utils.ts",
    "src/domain/progress.ts",
    "src/lib/worker.mts",
  ])("outside the data layer (%s)", (filePath) => {
    it.each([...forbiddenImports, ...authInstanceUses])(
      "refuses %s",
      async (code) => {
        expect(await boundaryErrors(code, filePath)).toEqual([1]);
      },
    );
  });

  it.each(["src/server/repositories/books.ts", "src/db/health.ts"])(
    "allows the data layer to import the database (%s)",
    async (filePath) => {
      const imports = forbiddenImports.filter(
        (code) => !code.startsWith("export"),
      );
      expect(await boundaryErrors(imports.join("\n"), filePath)).toEqual([]);
    },
  );

  it("refuses repositories that re-export database modules", async () => {
    expect(
      await boundaryErrors(
        [
          'export { getDb } from "@/db/client";',
          'export * from "@/db/schema";',
          'export * as tables from "../../db/auth-schema";',
        ].join("\n"),
        "src/server/repositories/books.ts",
      ),
    ).toEqual([1, 2, 3]);
  });

  it("refuses the auth instance in repositories", async () => {
    expect(
      await boundaryErrors(
        authInstanceUses.join("\n"),
        "src/server/repositories/books.ts",
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it.each([
    "src/server/auth/session.ts",
    "src/app/api/auth/[...all]/route.ts",
    "src/server/actions/auth.ts",
  ])(
    "lets Better Auth's own code use its instance but not the database (%s)",
    async (filePath) => {
      expect(
        await boundaryErrors(authInstanceUses.join("\n"), filePath),
      ).toEqual([]);
      expect(
        await boundaryErrors('import { getDb } from "@/db/client";', filePath),
      ).toEqual([1]);
    },
  );

  it("lets Better Auth's adapter wiring import the database", async () => {
    expect(
      await boundaryErrors(
        forbiddenImports
          .filter((code) => !code.startsWith("export"))
          .join("\n"),
        "src/server/auth/index.ts",
      ),
    ).toEqual([]);
  });

  it("lets the health route reach only src/db/health", async () => {
    const filePath = "src/app/api/health/route.ts";
    expect(
      await boundaryErrors(
        'import { isDatabaseHealthy } from "@/db/health";',
        filePath,
      ),
    ).toEqual([]);
    expect(
      await boundaryErrors('import { Pool } from "pg";', filePath),
    ).toEqual([1]);
    expect(
      await boundaryErrors(
        'import { getAuth } from "@/server/auth";',
        filePath,
      ),
    ).toEqual([1]);
  });

  it("allows repositories, the session guard and auth helpers elsewhere", async () => {
    expect(
      await boundaryErrors(
        [
          'import { listSessions } from "@/server/repositories/sessions";',
          'import { requireUser } from "@/server/auth/session";',
          'import { isGoogleSignInEnabled } from "@/server/auth";',
          'import { authClient } from "@/lib/auth-client";',
        ].join("\n"),
        "src/server/actions/sessions.ts",
      ),
    ).toEqual([]);
  });

  // The lint rules only see static imports and can be silenced inline.
  describe("cannot be bypassed in application code", () => {
    const files = sourceFiles(srcDir).filter(
      (file) =>
        !/\.test\.[cm]?[jt]sx?$/.test(file) &&
        !/^db\//.test(relativeToSrc(file)),
    );

    it("with inline eslint-disable comments for the boundary rules", () => {
      const offenders = files.filter((file) =>
        // A disable without a rule list turns every rule off; or one naming the boundary rules.
        /eslint-disable(?:-next-line|-line)?(?:\s*(?:\*\/|$)|[^\n]*no-restricted-(?:imports|syntax))/m.test(
          readFileSync(file, "utf-8"),
        ),
      );
      expect(offenders.map(relativeToSrc)).toEqual([]);
    });

    it("with dynamic import() or require() of the database", () => {
      const allowed = /^(db|server\/repositories)\//;
      const offenders = files.filter((file) => {
        if (allowed.test(relativeToSrc(file))) return false;
        return /\b(?:import|require)\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*["'`][^"'`]*(?:(?:^|\/)db(?:\/|["'`])|drizzle-orm|\bpg\b|\bpostgres\b|@neondatabase|@vercel\/postgres)/.test(
          readFileSync(file, "utf-8"),
        );
      });
      expect(offenders.map(relativeToSrc)).toEqual([]);
    });

    it("with import() of a computed specifier, or createRequire", () => {
      // Reviewed computed imports, none of which can reach the database.
      const reviewed = new Set([
        // next-intl: the locale's catalog from messages/ (locale checked against routing).
        "i18n/request.ts",
      ]);
      const offenders = files.filter(
        (file) =>
          !reviewed.has(relativeToSrc(file)) &&
          /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*(?!["'])|\bcreateRequire\b/.test(
            readFileSync(file, "utf-8"),
          ),
      );
      expect(offenders.map(relativeToSrc)).toEqual([]);
    });
  });

  // Lint sees `export { getDb }` only with a source; a repository could still import the client
  // and export it under any name. Check what the repositories actually export.
  it("repositories export no client, database or table", async () => {
    const repositories = sourceFiles(path.join(srcDir, "server/repositories"))
      .filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file))
      .map((file) => relativeToSrc(file).replace(SOURCE, ""));
    expect(repositories).toContain("server/repositories/sessions");

    const leaks: string[] = [];
    for (const repository of repositories) {
      const exports: Record<string, unknown> = await import(`@/${repository}`);
      for (const [name, value] of Object.entries(exports)) {
        if (
          value === getDb ||
          is(value, PgDatabase) ||
          is(value, PgTable) ||
          (typeof value === "object" &&
            value !== null &&
            Object.values(value).some((inner) => is(inner, PgTable)))
        ) {
          leaks.push(`${repository}.${name}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
