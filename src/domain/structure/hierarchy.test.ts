import { describe, expect, it } from "vitest";

import { allowedChildKinds, canPlace, type NodeKind } from "./hierarchy";

describe("allowedChildKinds", () => {
  it.each([
    [null, ["part", "chapter"]],
    ["part", ["chapter"]],
    ["chapter", ["topic"]],
    ["topic", []],
  ] as const)("under %s allows %j", (parent, kinds) => {
    expect(allowedChildKinds(parent)).toEqual(kinds);
  });
});

describe("canPlace", () => {
  it.each<[NodeKind, NodeKind | null, boolean]>([
    // D-06: parts are optional, chapters may sit right at the book's root.
    ["part", null, true],
    ["chapter", null, true],
    ["topic", null, false],
    ["part", "part", false],
    ["chapter", "part", true],
    ["topic", "part", false],
    ["part", "chapter", false],
    ["chapter", "chapter", false],
    ["topic", "chapter", true],
    // Three levels at most: nothing below a topic.
    ["part", "topic", false],
    ["chapter", "topic", false],
    ["topic", "topic", false],
  ])("%s under %s → %s", (kind, parent, expected) => {
    expect(canPlace(kind, parent)).toBe(expected);
  });
});
