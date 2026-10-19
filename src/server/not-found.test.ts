import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import { foundOrNotFound } from "./not-found";

describe("foundOrNotFound", () => {
  it("returns the resource when the repository found it", () => {
    const resource = { id: "a" };
    expect(foundOrNotFound(resource)).toBe(resource);
  });

  it("answers a miss (missing or another reader's resource) with a 404, not a 403", () => {
    expect(() => foundOrNotFound(undefined)).toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("treats null as a miss too", () => {
    expect(() => foundOrNotFound(null)).toThrow("NEXT_NOT_FOUND");
  });

  it("keeps falsy resources that were found", () => {
    expect(foundOrNotFound(0)).toBe(0);
    expect(foundOrNotFound("")).toBe("");
  });
});
