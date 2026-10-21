"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DerivedReading,
  ReadingControls,
  type ReadingActions,
} from "@/components/structure/reading-controls";
import { countLeaves, leavesToComplete } from "@/domain/reading/derived";
import {
  calendarDay,
  changeStatus,
  type ReadingState,
} from "@/domain/reading/status";
import {
  buildTree,
  type FlatNode,
  type TreeNode,
} from "@/domain/structure/tree";
import { Link } from "@/i18n/navigation";
import { APP_TIME_ZONE } from "@/i18n/time-zone";
import { nodePath } from "@/lib/routes";

import { keyEffect, parentIds, visibleItems } from "./tree-keys";

type Props = Readonly<{
  bookId: string;
  // The book's nodes as stored; the tree (and every parent's derived state) is built here, so a
  // change shows up in the ancestors before the server answers.
  nodes: readonly FlatNode[];
  // How many notes each node's notebook holds (US-018); nodes without notes may be left out.
  noteCounts: Readonly<Record<string, number>>;
  // The reading Server Actions; injected so tests can replace them.
  actions: ReadingActions;
}>;

// Collapsed items survive reloads within the browser session (sessionStorage), per book, read
// through an external store so the server render (nothing collapsed) and the browser agree. Only
// node ids are kept there, never titles. Kept in memory too, for when storage is blocked.
const storageKey = (bookId: string) => `read-in-blocks:toc-collapsed:${bookId}`;
const MAX_STORED_IDS = 2_000;
const NONE_COLLAPSED = "[]";
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readCollapsed(bookId: string): string {
  const key = storageKey(bookId);
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  let stored = NONE_COLLAPSED;
  try {
    stored = sessionStorage.getItem(key) ?? NONE_COLLAPSED;
  } catch {
    // Blocked storage: start with everything expanded.
  }
  memory.set(key, stored);
  return stored;
}

function writeCollapsed(bookId: string, collapsed: ReadonlySet<string>) {
  const key = storageKey(bookId);
  const value = JSON.stringify([...collapsed].slice(0, MAX_STORED_IDS));
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Full or blocked storage: the tree still works, it just forgets on reload.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Anything but a list of strings (tampered storage) counts as nothing collapsed.
function parseCollapsed(value: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? new Set(
          parsed
            .filter((id): id is string => typeof id === "string")
            .slice(0, MAX_STORED_IDS),
        )
      : new Set();
  } catch {
    return new Set();
  }
}

// "Today" only for the instant feedback: the server computes the dates it stores (D-19).
const today = () => calendarDay(new Date(), APP_TIME_ZONE);

// The interactive table of contents (US-015): a collapsible tree (WAI-ARIA tree view, roving
// tabindex) with each node's state and how many of its leaves are completed. Choosing a node opens
// its details (summary, goal and state), where a leaf's state can change: the new state shows in
// the tree and in its ancestors right away, then the page data refreshes. Titles are the reader's
// content: rendered as text, never as markup.
export function TableOfContents({ bookId, nodes, noteCounts, actions }: Props) {
  const t = useTranslations("toc");
  const treeId = useId();
  // Leaf states changed here and not yet back from the server.
  const [pending, setPending] = useState<ReadonlyMap<string, ReadingState>>(
    new Map(),
  );
  // New data from the server replaces whatever was pending.
  const [seenNodes, setSeenNodes] = useState(nodes);
  if (seenNodes !== nodes) {
    setSeenNodes(nodes);
    setPending(new Map());
  }
  const storedCollapsed = useSyncExternalStore(
    subscribe,
    () => readCollapsed(bookId),
    () => NONE_COLLAPSED,
  );
  const collapsed = parseCollapsed(storedCollapsed);
  const setCollapsed = (next: ReadonlySet<string>) =>
    writeCollapsed(bookId, next);
  const [focusedId, setFocusedId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const register = useCallback((id: string, element: HTMLLIElement | null) => {
    if (element) itemRefs.current.set(id, element);
    else itemRefs.current.delete(id);
  }, []);

  const roots = buildTree(
    pending.size === 0
      ? nodes
      : nodes.map((node) => {
          const state = pending.get(node.id);
          return state ? { ...node, ...state } : node;
        }),
  );
  const items = visibleItems(roots, collapsed);
  const tabStop = items.some((item) => item.id === focusedId)
    ? focusedId
    : items[0]?.id;
  const selected = selectedId ? findNode(roots, selectedId) : undefined;

  const setLeafStates = (states: Iterable<[string, ReadingState]>) =>
    setPending((current) => new Map([...current, ...states]));
  const dropPending = (ids: readonly string[]) =>
    setPending((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });

  // The details panel uses these: the change shows at once, and is undone if the server refuses.
  const detailActions: ReadingActions = {
    setDates: actions.setDates,
    setStatus: async (nodeId, input) => {
      const node = findNode(roots, nodeId);
      if (node)
        setLeafStates([[nodeId, changeStatus(node, input.status, today())]]);
      const result = await actions.setStatus(nodeId, input);
      if (!result.ok) dropPending([nodeId]);
      return result;
    },
    completeAll: async (nodeId) => {
      const node = findNode(roots, nodeId);
      const leaves = node ? leavesToComplete(node) : [];
      setLeafStates(
        leaves.flatMap((id) => {
          const leaf = findNode(roots, id);
          return leaf ? [[id, changeStatus(leaf, "completed", today())]] : [];
        }),
      );
      const result = await actions.completeAll(nodeId);
      if (!result.ok) dropPending(leaves);
      return result;
    },
  };

  function toggle(id: string, expand: boolean) {
    const next = new Set(collapsed);
    if (expand) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }

  function moveFocus(id: string) {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  }

  function select(id: string) {
    setFocusedId(id);
    setSelectedId(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (!tabStop) return;
    const effect = keyEffect(event.key, items, tabStop);
    if (effect.kind === "none") return;
    event.preventDefault();
    switch (effect.kind) {
      case "focus":
        moveFocus(effect.id);
        break;
      case "expand":
        toggle(effect.id, true);
        break;
      case "collapse":
        toggle(effect.id, false);
        break;
      case "select":
        select(effect.id);
        break;
    }
  }

  return (
    <section
      aria-labelledby={`${treeId}-title`}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${treeId}-title`} className="text-lg font-semibold">
          {t("title")}
        </h2>
        {roots.some((node) => node.children.length > 0) ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCollapsed(new Set())}
            >
              {t("expandAll")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCollapsed(new Set(parentIds(roots)))}
            >
              {t("collapseAll")}
            </Button>
          </div>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {roots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p id={`${treeId}-hint`} className="text-muted-foreground text-xs">
              {t("hint")}
            </p>
            <ul
              role="tree"
              aria-label={t("treeLabel")}
              aria-describedby={`${treeId}-hint`}
              onKeyDown={onKeyDown}
              className="flex flex-col gap-0.5"
            >
              {roots.map((node, index) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  level={1}
                  position={index + 1}
                  siblings={roots.length}
                  collapsed={collapsed}
                  tabStop={tabStop}
                  selectedId={selectedId}
                  register={register}
                  onToggle={toggle}
                  onSelect={select}
                  onFocusItem={setFocusedId}
                  noteCounts={noteCounts}
                />
              ))}
            </ul>
          </div>
          <NodeDetails
            bookId={bookId}
            node={selected}
            notes={selected ? (noteCounts[selected.id] ?? 0) : 0}
            actions={detailActions}
            announce={setAnnouncement}
          />
        </div>
      )}
    </section>
  );
}

function TreeItem({
  node,
  level,
  position,
  siblings,
  collapsed,
  tabStop,
  selectedId,
  register,
  onToggle,
  onSelect,
  onFocusItem,
  noteCounts,
}: Readonly<{
  node: TreeNode;
  level: number;
  position: number;
  siblings: number;
  collapsed: ReadonlySet<string>;
  tabStop: string | undefined;
  selectedId: string | undefined;
  register: (id: string, element: HTMLLIElement | null) => void;
  onToggle: (id: string, expand: boolean) => void;
  onSelect: (id: string) => void;
  onFocusItem: (id: string) => void;
  noteCounts: Readonly<Record<string, number>>;
}>) {
  const t = useTranslations("toc");
  const tStructure = useTranslations("structure");
  const labelId = useId();
  const notes = noteCounts[node.id] ?? 0;
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsed.has(node.id);
  const count = countLeaves(node);

  return (
    <li
      ref={(element) => register(node.id, element)}
      role="treeitem"
      aria-labelledby={labelId}
      aria-level={level}
      aria-posinset={position}
      aria-setsize={siblings}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={node.id === selectedId}
      tabIndex={node.id === tabStop ? 0 : -1}
      onFocus={(event) => {
        // Focus that lands here by any means (click, script, assistive technology) moves the tab
        // stop; an ancestor ignores the focus of its children.
        if (event.target === event.currentTarget) onFocusItem(node.id);
      }}
      onClick={(event) => {
        // A click inside a child item belongs to that item.
        event.stopPropagation();
        onSelect(node.id);
      }}
      className="group/item rounded-md outline-none focus-visible:[&>div]:ring-3 focus-visible:[&>div]:ring-ring/50"
    >
      <div className="hover:bg-muted group-aria-selected/item:bg-muted flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1">
        {hasChildren ? (
          <span
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id, !expanded);
            }}
            className="text-muted-foreground inline-flex w-4 justify-center"
          >
            {expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span aria-hidden="true" className="inline-block w-4" />
        )}
        <span
          id={labelId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2"
        >
          <span className="min-w-0 break-words">{node.title}</span>
          {/* A real space, so screen readers do not run the title into the state. */}{" "}
          <span className="text-muted-foreground text-xs">
            {tStructure(`reading.statuses.${node.status}`)}
            {hasChildren
              ? ` · ${t("progress", { completed: count.completed, total: count.total })}`
              : null}
            {notes > 0 ? ` · ${t("notes", { count: notes })}` : null}
          </span>
        </span>
        {hasChildren ? (
          // An SVG attribute, not a style one: the CSP refuses inline styles.
          <svg
            aria-hidden="true"
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            className="hidden h-1.5 w-16 overflow-hidden rounded-full sm:block"
          >
            <rect width="100" height="6" className="fill-muted" />
            <rect
              width={(count.completed / count.total) * 100}
              height="6"
              className="fill-primary"
            />
          </svg>
        ) : null}
      </div>
      {expanded ? (
        <ul role="group" className="ml-4 flex flex-col gap-0.5 border-l pl-2">
          {node.children.map((child, index) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              position={index + 1}
              siblings={node.children.length}
              collapsed={collapsed}
              tabStop={tabStop}
              selectedId={selectedId}
              register={register}
              onToggle={onToggle}
              onSelect={onSelect}
              onFocusItem={onFocusItem}
              noteCounts={noteCounts}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function NodeDetails({
  bookId,
  node,
  notes,
  actions,
  announce,
}: Readonly<{
  bookId: string;
  node: TreeNode | undefined;
  notes: number;
  actions: ReadingActions;
  announce: (message: string) => void;
}>) {
  const t = useTranslations("toc");
  const tStructure = useTranslations("structure");
  const headingId = useId();

  if (!node) {
    return (
      <aside className="text-muted-foreground rounded-xl border p-4 text-sm">
        {t("details.empty")}
      </aside>
    );
  }
  return (
    <aside
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs uppercase">
          {tStructure(`kinds.${node.kind}`)}
        </span>
        <h3 id={headingId} className="font-medium break-words">
          {node.title}
        </h3>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">
            {t("details.summary")}
          </dt>
          <dd className="break-words whitespace-pre-line">
            {node.summary ?? t("details.noSummary")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t("details.goal")}</dt>
          <dd>
            {node.goalPages === null
              ? tStructure("details.defaultWeight")
              : tStructure("details.goal", { count: node.goalPages })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            {t("details.notes")}
          </dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("notes", { count: notes })}</span>
            <Link
              href={nodePath(bookId, node.id)}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {t("details.openNotebook")}
            </Link>
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">
          {t("details.state")}
        </span>
        {node.children.length === 0 ? (
          <ReadingControls node={node} actions={actions} announce={announce} />
        ) : (
          <DerivedReading
            node={node}
            completeAll={actions.completeAll}
            announce={announce}
          />
        )}
      </div>
    </aside>
  );
}

function findNode(
  nodes: readonly TreeNode[],
  id: string,
): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}
