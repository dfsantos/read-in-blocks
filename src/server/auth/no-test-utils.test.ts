import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

// Better Auth's testUtils plugin creates users and sessions without signing in. It may only be
// loaded by the E2E helpers under tests/, never by application code.
describe("Better Auth test utilities", () => {
  it("are never loaded by application code", () => {
    const offenders = sourceFiles(srcDir).filter((file) =>
      /\btestUtils\b|@better-auth\/test-utils/.test(
        readFileSync(file, "utf-8"),
      ),
    );
    expect(offenders.map((file) => path.relative(srcDir, file))).toEqual([]);
  });
});
