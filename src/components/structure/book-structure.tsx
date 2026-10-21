"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { allowedChildKinds } from "@/domain/structure/hierarchy";
import type {
  AddNodesFormValues,
  RenameNodeFormValues,
} from "@/domain/structure/node-input";
import { countDescendants, type TreeNode } from "@/domain/structure/tree";
import type {
  AddNodesResult,
  DeleteNodeResult,
  RenameNodeResult,
} from "@/server/actions/book-nodes";

import { AddNodesForm } from "./add-nodes-form";
import { DeleteNodeButton, RenameNodeForm } from "./node-actions";

// The Server Actions, injected so tests can replace them; add is already bound to the book.
export type StructureActions = Readonly<{
  add: (
    parentId: string | null,
    input: AddNodesFormValues,
  ) => Promise<AddNodesResult>;
  rename: (
    nodeId: string,
    input: RenameNodeFormValues,
  ) => Promise<RenameNodeResult>;
  remove: (nodeId: string) => Promise<DeleteNodeResult>;
}>;

type Props = Readonly<{ tree: TreeNode[]; actions: StructureActions }>;

// The book's structure as a simple nested list (US-010); the interactive table of contents arrives
// in US-015. Each node can be renamed, deleted with its subtree, and receive children of the kinds
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
  return (
    <ul
      aria-label={label}
      className="flex flex-col gap-1 [&_ul]:mt-1 [&_ul]:border-l [&_ul]:pl-4"
    >
      {nodes.map((node) => (
        <NodeItem key={node.id} node={node} actions={actions} />
      ))}
    </ul>
  );
}

function NodeItem({
  node,
  actions,
}: Readonly<{ node: TreeNode; actions: StructureActions }>) {
  const t = useTranslations("structure");
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const childKinds = allowedChildKinds(node.kind);

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {renaming ? (
          <RenameNodeForm
            nodeId={node.id}
            title={node.title}
            action={actions.rename}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <>
            <span className="text-muted-foreground text-xs uppercase">
              {t(`kinds.${node.kind}`)}
            </span>
            <span className="min-w-0 flex-1 break-words">{node.title}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("rename.open", { title: node.title })}
              onClick={() => setRenaming(true)}
            >
              {t("rename.openShort")}
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
          </>
        )}
      </div>
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
