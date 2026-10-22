"use client";

import { useTranslations } from "next-intl";
import { createContext, use, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { effectiveWeights } from "@/domain/progress/weight";
import { allowedChildKinds } from "@/domain/structure/hierarchy";
import { moveTargets } from "@/domain/structure/move";
import {
  MAX_NODES_PER_BOOK,
  type AddNodesFormValues,
  type MoveNodeInput,
  type NodeDetailsFormValues,
} from "@/domain/structure/node-input";
import { countDescendants, type TreeNode } from "@/domain/structure/tree";
import { useRouter } from "@/i18n/navigation";
import type {
  AddNodesResult,
  DeleteNodeResult,
  MoveNodeResult,
  StructureErrorKey,
  UpdateNodeResult,
} from "@/server/actions/book-nodes";

import { AddNodesForm } from "./add-nodes-form";
import { MoveNodeForm } from "./move-node-form";
import {
  DerivedReading,
  ReadingControls,
  type ReadingActions,
} from "./reading-controls";
import { DeleteNodeButton, EditNodeForm } from "./node-actions";

// The Server Actions, injected so tests can replace them; add is already bound to the book.
export type StructureActions = Readonly<{
  add: (
    parentId: string | null,
    input: AddNodesFormValues,
  ) => Promise<AddNodesResult>;
  update: (
    nodeId: string,
    input: NodeDetailsFormValues,
  ) => Promise<UpdateNodeResult>;
  move: (nodeId: string, input: MoveNodeInput) => Promise<MoveNodeResult>;
  remove: (nodeId: string) => Promise<DeleteNodeResult>;
}> &
  ReadingActions;

type Dragging = { id: string; parentId: string | null };

// What every node needs from the whole structure: the actions, the tree (to list where a node may
// move) and the node being dragged, if any.
const StructureContext = createContext<{
  actions: StructureActions;
  roots: readonly TreeNode[];
  dragging: Dragging | null;
  setDragging: (dragging: Dragging | null) => void;
  // Read out by screen readers after a reorder or move: the item may lose focus when it moves.
  announce: (message: string) => void;
} | null>(null);

function useStructure() {
  const context = use(StructureContext);
  if (!context) throw new Error("useStructure outside BookStructure");
  return context;
}

type Props = Readonly<{ tree: TreeNode[]; actions: StructureActions }>;

// The book's structure as a simple nested list (US-010); the interactive table of contents arrives
// in US-015. Each node can be edited (title, summary and goal, US-011), reordered among its
// siblings by dragging or with Subir/Descer, moved to another parent (US-012), marked as not
// started, in progress or completed when it is a leaf (US-013) or shown with the state derived
// from its children, with "complete all" (US-014), deleted with its subtree, and
// receive children of the kinds the hierarchy allows. Titles are the reader's content: rendered
// as text, never as markup.
export function BookStructure({ tree, actions }: Props) {
  const t = useTranslations("structure");
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [announcement, setAnnouncement] = useState("");

  return (
    <StructureContext
      value={{
        actions,
        roots: tree,
        dragging,
        setDragging,
        announce: setAnnouncement,
      }}
    >
      <section
        aria-labelledby="structure-title"
        className="flex flex-col gap-4"
      >
        <h2 id="structure-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {tree.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t("reorderHint")}</p>
            <NodeList nodes={tree} label={t("listLabel")} />
          </>
        )}
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="font-medium">{t("add.rootTitle")}</h3>
          <AddNodesForm
            parentId={null}
            kinds={allowedChildKinds(null)}
            action={actions.add}
          />
        </div>
      </section>
    </StructureContext>
  );
}

function NodeList({
  nodes,
  label,
}: Readonly<{ nodes: TreeNode[]; label?: string }>) {
  // Weights are relative to the siblings (ADR-0009): a node without a goal is marked as taking
  // the default weight of its group.
  const weights = effectiveWeights(nodes);
  return (
    <ul
      aria-label={label}
      className="flex flex-col gap-1 [&_ul]:mt-1 [&_ul]:border-l [&_ul]:pl-4"
    >
      {nodes.map((node, index) => (
        <NodeItem
          key={node.id}
          node={node}
          index={index}
          siblings={nodes.length}
          defaultWeight={weights[index].isDefault}
        />
      ))}
    </ul>
  );
}

function NodeItem({
  node,
  index,
  siblings,
  defaultWeight,
}: Readonly<{
  node: TreeNode;
  index: number;
  siblings: number;
  defaultWeight: boolean;
}>) {
  const t = useTranslations("structure");
  const router = useRouter();
  const { actions, roots, dragging, setDragging, announce } = useStructure();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const [errorKey, setErrorKey] = useState<StructureErrorKey>();
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  // After Subir/Descer the focus stays on the moved item: on the same button, or on the other one
  // when this one is disabled at the end of the list (a disabled button drops the focus).
  const refocus = useRef<"up" | "down" | null>(null);
  useEffect(() => {
    const wanted = refocus.current;
    if (!wanted) return;
    refocus.current = null;
    const atTop = index === 0;
    const atBottom = index === siblings - 1;
    const target = wanted === "up" ? (atTop ? down : up) : atBottom ? up : down;
    target.current?.focus();
  }, [index, siblings]);
  const childKinds = allowedChildKinds(node.kind);
  const targets = moveTargets(roots, node);
  // Only among siblings: moving elsewhere goes through "Mover" (US-012).
  const canDrop =
    dragging !== null &&
    dragging.id !== node.id &&
    dragging.parentId === node.parentId;

  async function move(nodeId: string, input: MoveNodeInput) {
    setErrorKey(undefined);
    const result = await actions.move(nodeId, input);
    if (result.ok) {
      setMoving(false);
      announce(t("move.moved", { title: titleOf(nodeId) }));
      router.refresh();
      return;
    }
    refocus.current = null;
    setErrorKey(result.errorKey);
  }

  // The moved node is this one, or a sibling dropped on it.
  const titleOf = (nodeId: string) =>
    nodeId === node.id ? node.title : findTitle(roots, nodeId);

  const reorder = (to: number) =>
    move(node.id, { parentId: node.parentId, index: to });

  return (
    <li className="flex flex-col gap-1">
      {editing ? (
        <EditNodeForm
          node={node}
          action={actions.update}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div
          draggable
          data-drop-target={dropTarget || undefined}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.id);
            setDragging({ id: node.id, parentId: node.parentId });
          }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => {
            if (!canDrop) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget(true);
          }}
          onDragLeave={() => setDropTarget(false)}
          onDrop={(event) => {
            setDropTarget(false);
            if (!canDrop || !dragging) return;
            event.preventDefault();
            setDragging(null);
            // The dragged node takes the place of the one it was dropped on (planMove).
            void move(dragging.id, { parentId: node.parentId, index });
          }}
          className="data-drop-target:bg-muted flex cursor-grab flex-col gap-0.5 rounded-md"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground text-xs uppercase">
              {t(`kinds.${node.kind}`)}
            </span>
            <span className="min-w-0 grow basis-40 break-words">
              {node.title}
            </span>
            <span className="text-muted-foreground text-xs">
              {defaultWeight
                ? t("details.defaultWeight")
                : t("details.goal", { count: node.goalPages ?? 0 })}
            </span>
            <Button
              ref={up}
              size="sm"
              variant="ghost"
              disabled={index === 0}
              aria-label={t("move.upFor", { title: node.title })}
              onClick={() => {
                refocus.current = "up";
                void reorder(index - 1);
              }}
            >
              {t("move.up")}
            </Button>
            <Button
              ref={down}
              size="sm"
              variant="ghost"
              disabled={index === siblings - 1}
              aria-label={t("move.downFor", { title: node.title })}
              onClick={() => {
                refocus.current = "down";
                void reorder(index + 1);
              }}
            >
              {t("move.down")}
            </Button>
            {targets.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={moving}
                aria-label={t(moving ? "move.closeFor" : "move.openFor", {
                  title: node.title,
                })}
                onClick={() => setMoving((open) => !open)}
              >
                {moving ? t("move.close") : t("move.open")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("edit.open", { title: node.title })}
              onClick={() => setEditing(true)}
            >
              {t("edit.openShort")}
            </Button>
            {childKinds.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={adding}
                aria-label={t(adding ? "add.closeFor" : "add.open", {
                  title: node.title,
                })}
                onClick={() => setAdding((open) => !open)}
              >
                {adding ? t("add.close") : t("add.openShort")}
              </Button>
            ) : null}
            <DeleteNodeButton
              nodeId={node.id}
              title={node.title}
              descendants={countDescendants(node)}
              action={actions.remove}
            />
          </div>
          {node.summary ? (
            <p className="text-muted-foreground text-sm break-words whitespace-pre-line">
              {node.summary}
            </p>
          ) : null}
          {/* Only leaves store a reading state; a parent derives its own (US-014). */}
          {node.children.length === 0 ? (
            <ReadingControls
              node={node}
              actions={actions}
              announce={announce}
            />
          ) : (
            <DerivedReading
              node={node}
              completeAll={actions.completeAll}
              announce={announce}
            />
          )}
        </div>
      )}
      {errorKey ? (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${errorKey}`)}
        </p>
      ) : null}
      {moving ? (
        <div className="ml-4 rounded-xl border p-3">
          <MoveNodeForm
            title={node.title}
            targets={targets}
            onMove={(parentId) =>
              // To the end of the new siblings: no group is longer than a book, and the server
              // clamps the index to the group's length.
              move(node.id, { parentId, index: MAX_NODES_PER_BOOK })
            }
            onDone={() => setMoving(false)}
          />
        </div>
      ) : null}
      {adding ? (
        <div className="ml-4 rounded-xl border p-3">
          <AddNodesForm
            parentId={node.id}
            kinds={childKinds}
            action={actions.add}
            autoFocus
          />
        </div>
      ) : null}
      {node.children.length > 0 ? <NodeList nodes={node.children} /> : null}
    </li>
  );
}

function findTitle(nodes: readonly TreeNode[], id: string): string {
  for (const node of nodes) {
    if (node.id === id) return node.title;
    const found = findTitle(node.children, id);
    if (found) return found;
  }
  return "";
}
