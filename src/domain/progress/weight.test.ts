import { describe, expect, it } from "vitest";

import { defaultWeight, effectiveWeights, weightShares } from "./weight";

const siblings = (...goals: (number | null)[]) =>
  goals.map((goalPages) => ({ goalPages }));

describe("defaultWeight", () => {
  it.each([
    ["no siblings", [], 1],
    ["no sibling with a goal", [null, null], 1],
    ["the mean goal of the siblings that have one", [10, 30, null], 20],
    ["a single goal", [null, 45], 45],
  ])("is %s", (_name, goals, expected) => {
    expect(defaultWeight(siblings(...goals))).toBe(expected);
  });
});

describe("effectiveWeights", () => {
  it.each([
    [
      "goals as weights",
      [40, 60],
      [
        { weight: 40, isDefault: false },
        { weight: 60, isDefault: false },
      ],
    ],
    [
      "the same default for every sibling without a goal",
      [10, null, 30, null],
      [
        { weight: 10, isDefault: false },
        { weight: 20, isDefault: true },
        { weight: 30, isDefault: false },
        { weight: 20, isDefault: true },
      ],
    ],
    [
      "equal weights when no sibling has a goal",
      [null, null, null],
      [
        { weight: 1, isDefault: true },
        { weight: 1, isDefault: true },
        { weight: 1, isDefault: true },
      ],
    ],
    ["nothing for no siblings", [], []],
  ])("gives %s", (_name, goals, expected) => {
    expect(effectiveWeights(siblings(...goals))).toEqual(expected);
  });
});

describe("weightShares", () => {
  // The PRD's example (§6.2): a part that is 40% of the book weighs 40%.
  it("gives a part of 40 pages out of 100 a 40% share", () => {
    expect(weightShares(siblings(40, 60))).toEqual([0.4, 0.6]);
  });

  it.each([
    ["only the proportion matters", [4, 6], [0.4, 0.6]],
    [
      "equal shares without goals",
      [null, null, null, null],
      [0.25, 0.25, 0.25, 0.25],
    ],
    [
      "a default share next to measured siblings",
      [10, 30, null],
      [1 / 6, 0.5, 1 / 3],
    ],
    ["the whole to a lone node", [null], [1]],
  ])("keeps %s", (_name, goals, expected) => {
    const shares = weightShares(siblings(...goals));
    shares.forEach((share, i) => expect(share).toBeCloseTo(expected[i]));
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });
});
