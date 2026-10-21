// Keyboard model of the table of contents (US-015), after the WAI-ARIA tree view pattern: one
// focusable item at a time (roving tabindex), arrows move through the visible items, Right and Left
// expand, collapse or go to the first child or the parent. Pure, so it is tested without a DOM.

export type TreeShape = {
  id: string;
  children: readonly TreeShape[];
};

export type VisibleItem = {
  id: string;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
};

// The items a reader can reach, in reading order: every root, and the children of expanded items.
export function visibleItems(
  roots: readonly TreeShape[],
  collapsed: ReadonlySet<string>,
): VisibleItem[] {
  const items: VisibleItem[] = [];
  const walk = (nodes: readonly TreeShape[], parentId: string | null) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && !collapsed.has(node.id);
      items.push({ id: node.id, parentId, hasChildren, expanded });
      if (expanded) walk(node.children, node.id);
    }
  };
  walk(roots, null);
  return items;
}

export type KeyEffect =
  | { kind: "focus"; id: string }
  | { kind: "expand"; id: string }
  | { kind: "collapse"; id: string }
  | { kind: "select"; id: string }
  | { kind: "none" };

const NONE: KeyEffect = { kind: "none" };

// What `key` does with `focusedId` focused among `items` (visibleItems).
export function keyEffect(
  key: string,
  items: readonly VisibleItem[],
  focusedId: string,
): KeyEffect {
  const index = items.findIndex((item) => item.id === focusedId);
  if (index === -1) return items.length > 0 ? focus(items[0].id) : NONE;
  const item = items[index];

  switch (key) {
    case "ArrowDown":
      return index + 1 < items.length ? focus(items[index + 1].id) : NONE;
    case "ArrowUp":
      return index > 0 ? focus(items[index - 1].id) : NONE;
    case "Home":
      return focus(items[0].id);
    case "End":
      return focus(items[items.length - 1].id);
    case "ArrowRight":
      if (!item.hasChildren) return NONE;
      // Expanded: its first child comes right after it.
      return item.expanded
        ? focus(items[index + 1].id)
        : { kind: "expand", id: item.id };
    case "ArrowLeft":
      if (item.expanded) return { kind: "collapse", id: item.id };
      return item.parentId === null ? NONE : focus(item.parentId);
    case "Enter":
    case " ":
      return { kind: "select", id: item.id };
    default:
      return NONE;
  }
}

function focus(id: string): KeyEffect {
  return { kind: "focus", id };
}

// Every item with children, to collapse them all.
export function parentIds(roots: readonly TreeShape[]): string[] {
  return roots.flatMap((node) =>
    node.children.length > 0 ? [node.id, ...parentIds(node.children)] : [],
  );
}
