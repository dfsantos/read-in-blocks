import { describe, expect, it } from "vitest";

import {
  keyEffect,
  parentIds,
  visibleItems,
  type KeyEffect,
  type TreeShape,
} from "./tree-keys";

const n = (id: string, ...children: TreeShape[]): TreeShape => ({
  id,
  children,
});

// pre, p1 (c1 (t1, t2), c2), p2
const TREE = [n("pre"), n("p1", n("c1", n("t1"), n("t2")), n("c2")), n("p2")];

describe("visibleItems", () => {
  it.each<[string, string[], string[]]>([
    [
      "everything when nothing is collapsed",
      [],
      ["pre", "p1", "c1", "t1", "t2", "c2", "p2"],
    ],
    [
      "hides the children of a collapsed item",
      ["c1"],
      ["pre", "p1", "c1", "c2", "p2"],
    ],
    ["hides a whole collapsed subtree", ["p1"], ["pre", "p1", "p2"]],
    [
      "ignores a collapsed leaf",
      ["pre"],
      ["pre", "p1", "c1", "t1", "t2", "c2", "p2"],
    ],
  ])("%s", (_, collapsed, expected) => {
    expect(
      visibleItems(TREE, new Set(collapsed)).map((item) => item.id),
    ).toEqual(expected);
  });

  it("knows each item's parent and whether it is expanded", () => {
    expect(visibleItems(TREE, new Set(["c1"])).slice(1, 3)).toEqual([
      { id: "p1", parentId: null, hasChildren: true, expanded: true },
      { id: "c1", parentId: "p1", hasChildren: true, expanded: false },
    ]);
  });
});

describe("keyEffect", () => {
  const all = visibleItems(TREE, new Set());
  const withC1Collapsed = visibleItems(TREE, new Set(["c1"]));

  it.each<[string, string, string, KeyEffect, typeof all?]>([
    [
      "down moves to the next visible item",
      "ArrowDown",
      "p1",
      { kind: "focus", id: "c1" },
    ],
    [
      "down skips a collapsed subtree",
      "ArrowDown",
      "c1",
      { kind: "focus", id: "c2" },
      withC1Collapsed,
    ],
    ["down stops at the last item", "ArrowDown", "p2", { kind: "none" }],
    [
      "up moves to the previous visible item",
      "ArrowUp",
      "c2",
      { kind: "focus", id: "t2" },
    ],
    ["up stops at the first item", "ArrowUp", "pre", { kind: "none" }],
    ["home goes to the first item", "Home", "t2", { kind: "focus", id: "pre" }],
    ["end goes to the last item", "End", "c1", { kind: "focus", id: "p2" }],
    [
      "right expands a collapsed item",
      "ArrowRight",
      "c1",
      { kind: "expand", id: "c1" },
      withC1Collapsed,
    ],
    [
      "right on an expanded item goes to its first child",
      "ArrowRight",
      "c1",
      { kind: "focus", id: "t1" },
    ],
    ["right does nothing on a leaf", "ArrowRight", "t1", { kind: "none" }],
    [
      "left collapses an expanded item",
      "ArrowLeft",
      "p1",
      { kind: "collapse", id: "p1" },
    ],
    [
      "left on a leaf goes to its parent",
      "ArrowLeft",
      "t2",
      { kind: "focus", id: "c1" },
    ],
    [
      "left on a collapsed item goes to its parent",
      "ArrowLeft",
      "c1",
      { kind: "focus", id: "p1" },
      withC1Collapsed,
    ],
    ["left does nothing on a root leaf", "ArrowLeft", "pre", { kind: "none" }],
    ["enter selects", "Enter", "c2", { kind: "select", id: "c2" }],
    ["space selects", " ", "c2", { kind: "select", id: "c2" }],
    ["other keys do nothing", "a", "c2", { kind: "none" }],
    [
      "a focus no longer visible goes back to the first item",
      "ArrowDown",
      "gone",
      { kind: "focus", id: "pre" },
    ],
  ])("%s", (_, key, focused, expected, items = all) => {
    expect(keyEffect(key, items, focused)).toEqual(expected);
  });

  it("does nothing in an empty tree", () => {
    expect(keyEffect("ArrowDown", [], "x")).toEqual({ kind: "none" });
  });
});

describe("parentIds", () => {
  it("lists every item with children, at every depth", () => {
    expect(parentIds(TREE)).toEqual(["p1", "c1"]);
  });
});
