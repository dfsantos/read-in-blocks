"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  nodeDetailsSchema,
  type NodeDetails,
  type NodeDetailsFormValues,
} from "@/domain/structure/node-input";
import type { TreeNode } from "@/domain/structure/tree";
import { useRouter } from "@/i18n/navigation";
import type {
  DeleteNodeResult,
  StructureErrorKey,
  UpdateNodeResult,
} from "@/server/actions/book-nodes";

type EditProps = Readonly<{
  node: Pick<TreeNode, "id" | "title" | "summary" | "goalPages">;
  // The Server Action; injected so tests can replace it.
  action: (
    nodeId: string,
    input: NodeDetailsFormValues,
  ) => Promise<UpdateNodeResult>;
  onDone: () => void;
}>;

// Edits a node's title, summary and goal in pages in place (US-010, US-011). Escape or "Cancelar"
// leaves it as it was. The schema here is only for quick feedback: the Server Action parses again.
export function EditNodeForm({ node, action, onDone }: EditProps) {
  const t = useTranslations("structure");
  const router = useRouter();
  const id = useId();
  const form = useForm<NodeDetailsFormValues, unknown, NodeDetails>({
    resolver: zodResolver(nodeDetailsSchema),
    defaultValues: {
      title: node.title,
      summary: node.summary ?? "",
      goalPages: node.goalPages === null ? "" : String(node.goalPages),
    },
  });

  async function onSubmit() {
    // The values as typed: the server trims and checks them again.
    const result = await action(node.id, form.getValues());
    if (result.ok) {
      router.refresh();
      onDone();
      return;
    }
    form.setError(
      result.field ?? "root",
      { message: result.errorKey },
      { shouldFocus: true },
    );
  }

  const message = (key: string | undefined) =>
    key ? t(`errors.${key as StructureErrorKey}`) : undefined;
  const { errors } = form.formState;
  const rootError = message(errors.root?.message);
  const described = (field: string, hint: boolean, invalid: boolean) =>
    [
      hint ? `${id}-${field}-hint` : null,
      invalid ? `${id}-${field}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      noValidate
      aria-label={t("edit.legend", { title: node.title })}
      onSubmit={form.handleSubmit(onSubmit)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      className="flex w-full flex-col gap-3 rounded-xl border p-3"
    >
      <FieldGroup>
        <Field data-invalid={errors.title !== undefined}>
          <FieldLabel htmlFor={`${id}-title`}>{t("edit.title")}</FieldLabel>
          <Input
            {...form.register("title")}
            id={`${id}-title`}
            required
            autoFocus
            autoComplete="off"
            aria-invalid={errors.title !== undefined}
            aria-describedby={described(
              "title",
              false,
              errors.title !== undefined,
            )}
          />
          {errors.title ? (
            <FieldError id={`${id}-title-error`}>
              {message(errors.title.message)}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={errors.summary !== undefined}>
          <FieldLabel htmlFor={`${id}-summary`}>{t("edit.summary")}</FieldLabel>
          <Textarea
            {...form.register("summary")}
            id={`${id}-summary`}
            rows={3}
            aria-invalid={errors.summary !== undefined}
            aria-describedby={described(
              "summary",
              true,
              errors.summary !== undefined,
            )}
          />
          <FieldDescription id={`${id}-summary-hint`}>
            {t("edit.summaryHint")}
          </FieldDescription>
          {errors.summary ? (
            <FieldError id={`${id}-summary-error`}>
              {message(errors.summary.message)}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={errors.goalPages !== undefined}>
          <FieldLabel htmlFor={`${id}-goal`}>{t("edit.goal")}</FieldLabel>
          <Input
            {...form.register("goalPages")}
            id={`${id}-goal`}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-32"
            aria-invalid={errors.goalPages !== undefined}
            aria-describedby={described(
              "goal",
              true,
              errors.goalPages !== undefined,
            )}
          />
          <FieldDescription id={`${id}-goal-hint`}>
            {t("edit.goalHint")}
          </FieldDescription>
          {errors.goalPages ? (
            <FieldError id={`${id}-goal-error`}>
              {message(errors.goalPages.message)}
            </FieldError>
          ) : null}
        </Field>
        {rootError ? (
          <p role="alert" className="text-destructive text-sm">
            {rootError}
          </p>
        ) : null}
        <Field orientation="horizontal">
          <Button
            type="submit"
            size="sm"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t("edit.saving") : t("edit.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {t("edit.cancel")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

type DeleteProps = Readonly<{
  nodeId: string;
  title: string;
  // How many nodes go away with this one (countDescendants).
  descendants: number;
  // The Server Action; injected so tests can replace it.
  action: (nodeId: string) => Promise<DeleteNodeResult>;
}>;

// Deletes a node with its whole subtree after an explicit confirmation that says how many nodes go
// with it (US-010). The Server Action checks the session, the owner and the quota on its own.
export function DeleteNodeButton({
  nodeId,
  title,
  descendants,
  action,
}: DeleteProps) {
  const t = useTranslations("structure");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<StructureErrorKey>();

  async function confirm() {
    setPending(true);
    setErrorKey(undefined);
    const result = await action(nodeId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    setErrorKey(result.errorKey);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setErrorKey(undefined);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("delete.open", { title })}
          />
        }
      >
        {t("delete.openShort")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("delete.title", { title })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {descendants > 0
              ? t("delete.withChildren", { count: descendants })
              : t("delete.leaf")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorKey ? (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${errorKey}`)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("delete.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? t("delete.deleting") : t("delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
