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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  renameNodeSchema,
  type RenameNodeFormValues,
} from "@/domain/structure/node-input";
import { useRouter } from "@/i18n/navigation";
import type {
  DeleteNodeResult,
  RenameNodeResult,
  StructureErrorKey,
} from "@/server/actions/book-nodes";

type RenameProps = Readonly<{
  nodeId: string;
  title: string;
  // The Server Action; injected so tests can replace it.
  action: (
    nodeId: string,
    input: RenameNodeFormValues,
  ) => Promise<RenameNodeResult>;
  onDone: () => void;
}>;

// Renames a node in place (US-010). Escape or "Cancelar" leaves the title as it was.
export function RenameNodeForm({ nodeId, title, action, onDone }: RenameProps) {
  const t = useTranslations("structure");
  const router = useRouter();
  const id = useId();
  const form = useForm<RenameNodeFormValues>({
    resolver: zodResolver(renameNodeSchema),
    defaultValues: { title },
  });

  async function onSubmit() {
    const result = await action(nodeId, form.getValues());
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

  const error =
    form.formState.errors.title?.message ?? form.formState.errors.root?.message;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      className="flex flex-1 flex-wrap items-start gap-2"
    >
      <Field data-invalid={error !== undefined} className="min-w-48 flex-1">
        <FieldLabel htmlFor={`${id}-title`} className="sr-only">
          {t("rename.label", { title })}
        </FieldLabel>
        <Input
          {...form.register("title")}
          id={`${id}-title`}
          autoFocus
          autoComplete="off"
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <FieldError id={`${id}-error`}>
            {t(`errors.${error as StructureErrorKey}`)}
          </FieldError>
        ) : null}
      </Field>
      <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("rename.saving") : t("rename.save")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        {t("rename.cancel")}
      </Button>
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
