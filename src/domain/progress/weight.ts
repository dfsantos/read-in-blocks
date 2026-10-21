// Effective weight of sibling nodes (ADR-0009, US-011). A node's weight comes from its goal in
// pages (D-02), so siblings are comparable without any per-book setting. Only the proportion among
// siblings matters: the weighted progress (US-016) normalizes them.
//
// Nodes without a goal take the default weight, the same for all of them (ADR-0009). Its value is
// the mean goal of the siblings that have one, so a missing goal neither inflates nor shrinks a
// node next to its measured siblings; when no sibling has a goal, every sibling weighs the same.
// This reading of the ADR is recorded as D-16 (docs/plan/open-decisions.md).

export type WeightedSibling = {
  // The node's goal in pages, or null when it has none.
  goalPages: number | null;
};

export type EffectiveWeight = {
  weight: number;
  // Whether the weight is the default one (no goal), shown as such in the UI.
  isDefault: boolean;
};

// The default weight of the siblings without a goal (see above). 1 when none has a goal.
export function defaultWeight(siblings: readonly WeightedSibling[]): number {
  const goals = siblings
    .map((sibling) => sibling.goalPages)
    .filter((goal): goal is number => goal !== null);
  if (goals.length === 0) return 1;
  return goals.reduce((total, goal) => total + goal, 0) / goals.length;
}

// The effective weight of each sibling, in the same order.
export function effectiveWeights(
  siblings: readonly WeightedSibling[],
): EffectiveWeight[] {
  const fallback = defaultWeight(siblings);
  return siblings.map((sibling) =>
    sibling.goalPages === null
      ? { weight: fallback, isDefault: true }
      : { weight: sibling.goalPages, isDefault: false },
  );
}

// Each sibling's share of the whole (0 to 1), in the same order; they add up to 1.
export function weightShares(siblings: readonly WeightedSibling[]): number[] {
  const weights = effectiveWeights(siblings).map((item) => item.weight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (total === 0 ? 0 : weight / total));
}
