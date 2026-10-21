import { describe, expect, it } from "vitest";

import {
  buildTree,
  countDescendants,
  pathTo,
  type FlatNode,
  type TreeNode,
} from "./tree";

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

  it("gives every node with children the state derived from them (US-014)", () => {
    const [part] = buildTree([
      // Stored on the part's row, ignored: a parent's state is always derived.
      {
        ...node("p1", null, "part", 0),
        status: "completed",
        startedAt: "2020-01-01",
        completedAt: "2020-01-02",
      },
      node("c1", "p1", "chapter", 0),
      {
        ...node("t1", "c1", "topic", 0),
        status: "completed",
        startedAt: "2026-10-01",
        completedAt: "2026-10-03",
      },
      {
        ...node("c2", "p1", "chapter", 1),
        status: "in_progress",
        startedAt: "2026-10-05",
      },
    ]);
    const reading = (item: TreeNode) => [
      item.status,
      item.startedAt,
      item.completedAt,
    ];

    expect(reading(part.children[0])).toEqual([
      "completed",
      "2026-10-01",
      "2026-10-03",
    ]);
    expect(reading(part.children[1])).toEqual([
      "in_progress",
      "2026-10-05",
      null,
    ]);
    expect(reading(part)).toEqual(["in_progress", "2026-10-01", null]);
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

describe("pathTo", () => {
  const roots = buildTree([
    node("pre", null, "chapter", 0),
    node("p1", null, "part", 1),
    node("c1", "p1", "chapter", 0),
    node("t1", "c1", "topic", 0),
  ]);

  it.each([
    ["a root", "pre", ["pre"]],
    ["a part", "p1", ["p1"]],
    ["a chapter in a part", "c1", ["p1", "c1"]],
    ["a topic", "t1", ["p1", "c1", "t1"]],
    ["a node not in the tree", "missing", []],
  ])("%s", (_name, id, expected) => {
    expect(pathTo(roots, id).map((item) => item.id)).toEqual(expected);
  });
});
