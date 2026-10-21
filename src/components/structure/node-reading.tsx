"use client";

import { useState } from "react";

import type { TreeNode } from "@/domain/structure/tree";

import {
  DerivedReading,
  ReadingControls,
  type ReadingActions,
} from "./reading-controls";

// One node's reading state outside the structure editor (the node page, US-018): a leaf's own
// controls, or a parent's derived state with "complete all", plus the live region they announce in.
export function NodeReading({
  node,
  actions,
}: Readonly<{ node: TreeNode; actions: ReadingActions }>) {
  const [announcement, setAnnouncement] = useState("");

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {node.children.length === 0 ? (
        <ReadingControls
          node={node}
          actions={actions}
          announce={setAnnouncement}
        />
      ) : (
        <DerivedReading
          node={node}
          completeAll={actions.completeAll}
          announce={setAnnouncement}
        />
      )}
    </>
  );
}
