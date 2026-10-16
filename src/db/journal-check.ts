import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Guards the drizzle migration journal against rebases and merges (US-029): drizzle applies a
// migration only when its `when` is newer than the last applied one, so entries out of order or
// rewritten after reaching main would be silently skipped or diverge between databases.
// Usage: node src/db/journal-check.ts [base-ref]   (CI passes the PR base commit)

const MIGRATIONS_DIR = "src/db/migrations";
const JOURNAL_PATH = `${MIGRATIONS_DIR}/meta/_journal.json`;

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export function parseJournal(text: string): JournalEntry[] {
  const data: unknown = JSON.parse(text);
  const entries =
    data && typeof data === "object" && "entries" in data
      ? data.entries
      : undefined;
  if (!Array.isArray(entries)) throw new Error("journal has no entries list");
  return entries.map((entry: unknown, position) => {
    const { idx, when, tag } = (entry ?? {}) as Partial<JournalEntry>;
    if (
      typeof idx !== "number" ||
      typeof when !== "number" ||
      typeof tag !== "string"
    ) {
      throw new Error(`journal entry ${position} is malformed`);
    }
    return { idx, when, tag };
  });
}

// Returns the problems found; an empty list means the journal is consistent.
export function checkJournal(
  entries: JournalEntry[],
  baseEntries: JournalEntry[] = [],
): string[] {
  const problems: string[] = [];
  entries.forEach((entry, position) => {
    if (entry.idx !== position) {
      problems.push(`${entry.tag}: idx ${entry.idx}, expected ${position}`);
    }
    const previous = entries[position - 1];
    if (previous && entry.when <= previous.when) {
      problems.push(
        `${entry.tag}: "when" ${entry.when} is not after ${previous.tag} (${previous.when}); regenerate it after rebasing`,
      );
    }
  });
  baseEntries.forEach((base, position) => {
    const entry = entries[position];
    if (
      !entry ||
      entry.tag !== base.tag ||
      entry.when !== base.when ||
      entry.idx !== base.idx
    ) {
      problems.push(
        `${base.tag}: already on the base branch but missing, moved or changed here; never rewrite applied migrations`,
      );
    }
  });
  return problems;
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main(baseRef: string | undefined): number {
  const entries = parseJournal(readFileSync(JOURNAL_PATH, "utf8"));
  const problems = entries
    .filter(({ tag }) => !existsSync(`${MIGRATIONS_DIR}/${tag}.sql`))
    .map(({ tag }) => `${tag}: SQL file not found`);

  let baseEntries: JournalEntry[] = [];
  if (baseRef) {
    baseEntries = parseJournal(git("show", `${baseRef}:${JOURNAL_PATH}`));
    for (const { tag } of baseEntries) {
      const file = `${MIGRATIONS_DIR}/${tag}.sql`;
      if (git("diff", "--name-only", baseRef, "--", file).trim()) {
        problems.push(`${tag}: SQL changed after reaching the base branch`);
      }
    }
  }
  problems.push(...checkJournal(entries, baseEntries));

  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length === 0) {
    console.log(
      `Migration journal OK (${entries.length} entries${baseRef ? `, base ${baseRef}` : ""}).`,
    );
  }
  return problems.length === 0 ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv[2]);
}
