import { describe, expect, it } from "vitest";

import { moveTargets, planMove } from "./move";
import { buildTree, type FlatNode } from "./tree";

describe("planMove", () => {
  it.each([
    ["moves a node up", ["a", "b", "c"], "c", 1, ["a", "c", "b"]],
    ["moves a node down", ["a", "b", "c"], "a", 1, ["b", "a", "c"]],
    [
      "drops a node where the last sibling was",
      ["a", "b", "c"],
      "a",
      2,
      ["b", "c", "a"],
    ],
    [
      "drops a node where the first sibling was",
      ["a", "b", "c"],
      "c",
      0,
      ["c", "a", "b"],
    ],
    [
      "keeps the order for its own place",
      ["a", "b", "c"],
      "b",
      1,
      ["a", "b", "c"],
    ],
    ["clamps an index past the end", ["a", "b"], "a", 99, ["b", "a"]],
    ["clamps a negative index", ["a", "b"], "b", -3, ["b", "a"]],
  ])("%s among its siblings", (_name, ids, nodeId, index, expected) => {
    expect(planMove(ids, null, nodeId, index)).toEqual({
      source: expected,
      target: [],
    });
  });

  it.each([
    ["at the start", 0, ["x", "y1", "y2"]],
    ["in the middle", 1, ["y1", "x", "y2"]],
    ["at the end", 2, ["y1", "y2", "x"]],
    ["at the end when the index is past it", 10, ["y1", "y2", "x"]],
  ])("moves a node to another group %s", (_name, index, target) => {
    expect(planMove(["w", "x", "z"], ["y1", "y2"], "x", index)).toEqual({
      source: ["w", "z"],
      target,
    });
  });

  it("moves a node into an empty group", () => {
    expect(planMove(["x"], [], "x", 0)).toEqual({ source: [], target: ["x"] });
  });
});

describe("moveTargets", () => {
  const node = (
    id: string,
    parentId: string | null,
    kind: FlatNode["kind"],
    position: number,
  ): FlatNode => ({
    id,
    parentId,
    kind,
    title: id.toUpperCase(),
    position,
    summary: null,
    goalPages: null,
  });
  const tree = buildTree([
    node("pre", null, "chapter", 0),
    node("p1", null, "part", 1),
    node("c1", "p1", "chapter", 0),
    node("t1", "c1", "topic", 0),
    node("p2", null, "part", 2),
    node("c2", "p2", "chapter", 0),
  ]);
  const ids = (targets: ReturnType<typeof moveTargets>) =>
    targets.map((target) => target.parentId);

  it("offers a chapter in a part the root and the other parts", () => {
    expect(
      ids(moveTargets(tree, { id: "c1", kind: "chapter", parentId: "p1" })),
    ).toEqual([null, "p2"]);
  });

  it("offers a chapter at the root every part", () => {
    expect(
      ids(moveTargets(tree, { id: "pre", kind: "chapter", parentId: null })),
    ).toEqual(["p1", "p2"]);
  });

  it("offers a topic every other chapter, at the root or in a part", () => {
    expect(
      ids(moveTargets(tree, { id: "t1", kind: "topic", parentId: "c1" })),
    ).toEqual(["pre", "c2"]);
  });

  it("offers a part nowhere: it only reorders at the root", () => {
    expect(
      moveTargets(tree, { id: "p1", kind: "part", parentId: null }),
    ).toEqual([]);
  });

  it("names each target, the root as null", () => {
    expect(
      moveTargets(tree, { id: "c1", kind: "chapter", parentId: "p1" }),
    ).toEqual([
      { parentId: null, title: null },
      { parentId: "p2", title: "P2" },
    ]);
  });
});
