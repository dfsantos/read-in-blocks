import { PgDialect } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as authSchema from "@/db/auth-schema";

import { ownedBy } from "./owner-scope";

const dialect = new PgDialect();

describe("ownedBy", () => {
  it("filters by owner, as a bound parameter", () => {
    const query = dialect.sqlToQuery(
      ownedBy(authSchema.session.userId, "user-a")!,
    );
    expect(query.sql).toBe('"session"."user_id" = $1');
    expect(query.params).toEqual(["user-a"]);
  });

  it("adds the other conditions to the owner filter", () => {
    const query = dialect.sqlToQuery(
      ownedBy(
        authSchema.session.userId,
        "user-a",
        eq(authSchema.session.id, "session-1"),
      )!,
    );
    expect(query.sql).toBe(
      '("session"."user_id" = $1 and "session"."id" = $2)',
    );
    expect(query.params).toEqual(["user-a", "session-1"]);
  });

  it.each([[""], [undefined], [null]])(
    "refuses a missing userId (%s)",
    (userId) => {
      expect(() =>
        ownedBy(authSchema.session.userId, userId as unknown as string),
      ).toThrow("repository called without a userId");
    },
  );
});
