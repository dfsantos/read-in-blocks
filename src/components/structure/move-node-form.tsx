"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { MoveTarget } from "@/domain/structure/move";

// The root has no id; the select needs a value for it.
const ROOT = "root";

type Props = Readonly<{
  title: string;
  // Where the node may go (moveTargets); never empty when the form is shown.
  targets: readonly MoveTarget[];
  // Moves the node to the end of the chosen parent's children.
  onMove: (parentId: string | null) => Promise<void>;
  onDone: () => void;
}>;

// Moves a chapter to another part or to the book's root, or a topic to another chapter (US-012),
// with the keyboard as well as the mouse. The node goes to the end of its new siblings.
export function MoveNodeForm({ title, targets, onMove, onDone }: Props) {
  const t = useTranslations("structure.move");
  const id = useId();
  const [target, setTarget] = useState(targets[0]?.parentId ?? ROOT);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        await onMove(target === ROOT ? null : target);
        setPending(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Field className="w-auto">
        <FieldLabel htmlFor={`${id}-target`}>
          {t("destination", { title })}
        </FieldLabel>
        <NativeSelect
          id={`${id}-target`}
          autoFocus
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          {targets.map((option) => (
            <NativeSelectOption
              key={option.parentId ?? ROOT}
              value={option.parentId ?? ROOT}
            >
              {option.title ?? t("root")}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
