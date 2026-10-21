import { describe, expect, it } from "vitest";

import { buildTree, countDescendants, type FlatNode } from "./tree";

const node = (
  id: string,
  parentId: string | null,
  kind: FlatNode["kind"],
  position: number,
): FlatNode => ({
  id,
  parentId,
  kind,
  title: id,
  position,
  summary: null,
  goalPages: null,
  status: "not_started",
  startedAt: null,
  completedAt: null,
});

describe("buildTree", () => {
  it("builds nothing from no nodes", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests parts, chapters and topics and orders siblings by position", () => {
    const tree = buildTree([
      node("t2", "c1", "topic", 1),
      node("p2", null, "part", 2),
      node("c1", "p1", "chapter", 0),
      node("t1", "c1", "topic", 0),
      node("p1", null, "part", 1),
      node("pre", null, "chapter", 0),
      node("c2", "p1", "chapter", 1),
    ]);

    const ids = (list: ReturnType<typeof buildTree>): unknown[] =>
      list.map((item) =>
        item.children.length ? [item.id, ids(item.children)] : item.id,
      );
    expect(ids(tree)).toEqual([
      "pre",
      ["p1", [["c1", ["t1", "t2"]], "c2"]],
      "p2",
    ]);
  });

  it("leaves out a node whose parent is not in the list", () => {
    expect(
      buildTree([node("c1", "missing", "chapter", 0)]).map((item) => item.id),
    ).toEqual([]);
  });

  it("does not change the nodes it receives", () => {
    const nodes = [node("p1", null, "part", 0), node("c1", "p1", "chapter", 0)];
    const copy = structuredClone(nodes);
    buildTree(nodes);
    expect(nodes).toEqual(copy);
  });
});

describe("countDescendants", () => {
  it.each([
    ["a leaf", [node("c1", null, "chapter", 0)], 0],
    [
      "a chapter with topics",
      [
        node("c1", null, "chapter", 0),
        node("t1", "c1", "topic", 0),
        node("t2", "c1", "topic", 1),
      ],
      2,
    ],
    [
      "a part with its whole subtree",
      [
        node("p1", null, "part", 0),
        node("c1", "p1", "chapter", 0),
        node("t1", "c1", "topic", 0),
        node("c2", "p1", "chapter", 1),
      ],
      3,
    ],
  ])("counts %s", (_name, nodes, expected) => {
    expect(countDescendants(buildTree(nodes)[0])).toBe(expected);
  });
});
