// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Architecture test for the RLS owner setting (US-033, ADR-0008 item 6). The owner RLS trusts is
// app.user_id; set at session level it survives on the pooled connection and serves the next
// request someone else's rows. So: only withOwner sets it, always local to the transaction, and
// only repositories import withOwner. It reads the source as text: review is still needed.

const root = process.cwd();
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|sql)$/;
const TEST = /\.test\.[cm]?[jt]sx?$/;

const WITH_OWNER = "src/server/repositories/with-owner.ts";
// The Preview check sets the owner itself, the same way withOwner does.
const OWNER_SETTERS = new Set([WITH_OWNER, "scripts/check-rls-pooler.ts"]);

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return files(relative);
      return SOURCE.test(entry.name) && !TEST.test(entry.name)
        ? [relative]
        : [];
    },
  );
}

// What a file does with app.user_id that it must not (its controls are the last tests below).
function ownerSettingViolations(file: string, source: string): string[] {
  const problems: string[] = [];
  // Whole-line comments (//, /* */ blocks, SQL --) explain the hazards; they do not run.
  const text = source
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\/?\*|--)/.test(line))
    .join("\n");
  // set_config of app.user_id (or of a name computed at runtime, which could be it) that is not
  // local to the transaction: false, a variable, or no third argument. Other settings, such as the
  // migration runner's lock_timeout, are not the owner.
  let ownerSetConfigs = 0;
  for (const match of text.matchAll(/set_config\s*\(([^;]*?)\)/gi)) {
    const literalName = /^\s*(['"])([^'"]*)\1/.exec(match[1]);
    if (literalName && literalName[2] !== "app.user_id") continue;
    ownerSetConfigs += 1;
    if (!/,\s*true\s*$/i.test(match[1])) {
      problems.push(`${file}: set_config not local to the transaction`);
    }
  }
  for (const match of text.matchAll(
    /\b(?:set(?:\s+(session|local))?|reset)\s+"?app\.user_id\b/gi,
  )) {
    if (match[1]?.toLowerCase() !== "local") {
      problems.push(`${file}: session-level SET/RESET of app.user_id`);
    }
  }
  if (
    /\bset\s+(?:session\s+)?role\b|\bset\s+session\s+authorization\b/i.test(
      text,
    )
  ) {
    problems.push(`${file}: switches the database role`);
  }
  // Only the owner setters may set it; migrations and the policy helper may only read it.
  const mentions = text.match(/app\.user_id/g)?.length ?? 0;
  const reads =
    text.match(/current_setting\s*\(\s*'app\.user_id'/g)?.length ?? 0;
  if (!OWNER_SETTERS.has(file) && (mentions > reads || ownerSetConfigs > 0)) {
    problems.push(`${file}: sets the owner outside withOwner`);
  }
  if (
    !file.startsWith("src/server/repositories/") &&
    /["'][^"']*\/with-owner["']/.test(text)
  ) {
    problems.push(`${file}: imports withOwner outside the repositories`);
  }
  return problems;
}

describe("RLS owner setting", () => {
  it("only withOwner sets app.user_id, local to the transaction", () => {
    const sources = [...files("src"), ...files("scripts")];
    expect(sources).toContain(WITH_OWNER);
    const problems = sources.flatMap((file) =>
      ownerSettingViolations(
        file,
        readFileSync(path.join(root, file), "utf-8"),
      ),
    );
    expect(problems).toEqual([]);
  });

  it("withOwner sets the owner with set_config(..., true)", () => {
    expect(readFileSync(path.join(root, WITH_OWNER), "utf-8")).toMatch(
      /set_config\('app\.user_id', \$\{userId\}, true\)/,
    );
  });

  // Controls: the detector catches each hazard.
  it.each([
    ["sql`select set_config('app.user_id', ${id}, false)`", "not local"],
    ["sql`select set_config('app.user_id', ${id})`", "not local"],
    ["sql`select set_config(${name}, ${id}, ${local})`", "not local"],
    ["sql`set app.user_id = ${id}`", "session-level"],
    ["sql`SET SESSION app.user_id TO 'x'`", "session-level"],
    ['sql`set "app.user_id" = 1`', "session-level"],
    ["sql`reset app.user_id`", "session-level"],
    ["sql`set role migrator`", "switches the database role"],
    ["sql`set session authorization migrator`", "switches the database role"],
    ["sql`set local app.user_id = ${id}`", "outside withOwner"],
    ["sql`select set_config('app.user_id', ${id}, true)`", "outside withOwner"],
    [
      'import { withOwner } from "@/server/repositories/with-owner";',
      "imports withOwner outside",
    ],
  ])("refuses %s outside withOwner", (code, problem) => {
    expect(
      ownerSettingViolations("src/server/actions/books.ts", code).join("\n"),
    ).toContain(problem);
  });

  it.each([
    [
      "src/db/migrations/0004_create_book.sql",
      `CREATE POLICY "owner_only" ON "book" AS PERMISSIVE FOR ALL TO "app" USING (owner_id = current_setting('app.user_id', true)) WITH CHECK (owner_id = current_setting('app.user_id', true));`,
    ],
    [
      "src/server/repositories/books.ts",
      'import { withOwner } from "./with-owner";',
    ],
    [WITH_OWNER, "sql`select set_config('app.user_id', ${userId}, true)`"],
    [
      "src/db/migrate.ts",
      `client.query("SELECT set_config('lock_timeout', $1, false)", [timeout])`,
    ],
    ["src/db/rls.ts", "// a session-level SET app.user_id would leak"],
  ])("allows %s", (file, code) => {
    expect(ownerSettingViolations(file, code)).toEqual([]);
  });
});
