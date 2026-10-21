"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { allowedChildKinds } from "@/domain/structure/hierarchy";
import { effectiveWeights } from "@/domain/progress/weight";
import type {
  AddNodesFormValues,
  NodeDetailsFormValues,
} from "@/domain/structure/node-input";
import { countDescendants, type TreeNode } from "@/domain/structure/tree";
import type {
  AddNodesResult,
  DeleteNodeResult,
  UpdateNodeResult,
} from "@/server/actions/book-nodes";

import { AddNodesForm } from "./add-nodes-form";
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
  remove: (nodeId: string) => Promise<DeleteNodeResult>;
}>;

type Props = Readonly<{ tree: TreeNode[]; actions: StructureActions }>;

// The book's structure as a simple nested list (US-010); the interactive table of contents arrives
// in US-015. Each node can be edited (title, summary and goal, US-011), deleted with its subtree, and receive children of the kinds
// the hierarchy allows. Titles are the reader's content: rendered as text, never as markup.
export function BookStructure({ tree, actions }: Props) {
  const t = useTranslations("structure");

  return (
    <section aria-labelledby="structure-title" className="flex flex-col gap-4">
      <h2 id="structure-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {tree.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <NodeList nodes={tree} actions={actions} label={t("listLabel")} />
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
  );
}

function NodeList({
  nodes,
  actions,
  label,
}: Readonly<{ nodes: TreeNode[]; actions: StructureActions; label?: string }>) {
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
          defaultWeight={weights[index].isDefault}
          actions={actions}
        />
      ))}
    </ul>
  );
}

function NodeItem({
  node,
  defaultWeight,
  actions,
}: Readonly<{
  node: TreeNode;
  defaultWeight: boolean;
  actions: StructureActions;
}>) {
  const t = useTranslations("structure");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const childKinds = allowedChildKinds(node.kind);

  return (
    <li className="flex flex-col gap-1">
      {editing ? (
        <EditNodeForm
          node={node}
          action={actions.update}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground text-xs uppercase">
              {t(`kinds.${node.kind}`)}
            </span>
            <span className="min-w-0 flex-1 break-words">{node.title}</span>
            <span className="text-muted-foreground text-xs">
              {defaultWeight
                ? t("details.defaultWeight")
                : t("details.goal", { count: node.goalPages ?? 0 })}
            </span>
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
        </div>
      )}
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
      {node.children.length > 0 ? (
        <NodeList nodes={node.children} actions={actions} />
      ) : null}
    </li>
  );
}
