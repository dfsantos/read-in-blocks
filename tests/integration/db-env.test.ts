import { describe, expect, it } from "vitest";

import { assertLocalDatabaseUrl } from "./db-env";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgres://app:secret@localhost:5432/db",
    "postgres://app:secret@127.0.0.1:5432/db",
    "postgres://app:secret@[::1]:5432/db",
  ])("accepts the local database %s", (url) => {
    expect(() =>
      assertLocalDatabaseUrl("TEST_DATABASE_URL", url),
    ).not.toThrow();
  });

  it.each([
    "postgres://app:secret@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb",
    "postgres://app:secret@localhost.attacker.example/db",
    "postgres://app:secret@10.0.0.5:5432/db",
    "postgres://app:secret@postgres:5432/db",
    "not a url",
  ])("refuses %s without echoing it", (url) => {
    let message = "";
    try {
      assertLocalDatabaseUrl("TEST_DATABASE_URL", url);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(
      /^TEST_DATABASE_URL (must point to a local database|is not a valid URL)/,
    );
    expect(message).not.toContain("secret");
  });
});
