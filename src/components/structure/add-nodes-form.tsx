"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { NodeKind } from "@/domain/structure/hierarchy";
import {
  addNodesSchema,
  type AddNodesFormValues,
  type AddNodesInput,
} from "@/domain/structure/node-input";
import { useRouter } from "@/i18n/navigation";
import type {
  AddNodesResult,
  StructureErrorKey,
} from "@/server/actions/book-nodes";

type Props = Readonly<{
  // null: the book's root.
  parentId: string | null;
  // What may be added here (allowedChildKinds); the first one is the default.
  kinds: readonly NodeKind[];
  // The Server Action (addNodes bound to the book); injected so tests can replace it.
  action: (
    parentId: string | null,
    input: AddNodesFormValues,
  ) => Promise<AddNodesResult>;
  autoFocus?: boolean;
}>;

// Adds one or many nodes at once (US-010): one title per line, so a pasted table of contents
// becomes a list of chapters. The form stays open and empties itself after each addition, ready for
// the next paste. The schema here is only for quick feedback: the Server Action parses again.
export function AddNodesForm({ parentId, kinds, action, autoFocus }: Props) {
  const t = useTranslations("structure");
  const router = useRouter();
  const id = useId();
  const [added, setAdded] = useState<number>();
  const form = useForm<AddNodesFormValues, unknown, AddNodesInput>({
    resolver: zodResolver(addNodesSchema),
    defaultValues: { kind: kinds[0], titles: "" },
  });

  const message = (key: string | undefined) =>
    key ? t(`errors.${key as StructureErrorKey}`) : undefined;

  async function onSubmit() {
    setAdded(undefined);
    // The text as typed: the server splits and checks the lines again.
    const values = form.getValues();
    const result = await action(parentId, values);
    if (result.ok) {
      form.reset({ kind: values.kind, titles: "" });
      setAdded(result.data.count);
      router.refresh();
      return;
    }
    form.setError(
      result.field ?? "root",
      { message: result.errorKey },
      { shouldFocus: true },
    );
  }

  const rootError = message(form.formState.errors.root?.message);
  const submitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        {kinds.length > 1 ? (
          <Controller
            name="kind"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-kind`}>{t("add.kind")}</FieldLabel>
                <NativeSelect
                  {...field}
                  id={`${id}-kind`}
                  aria-invalid={fieldState.invalid}
                >
                  {kinds.map((kind) => (
                    <NativeSelectOption key={kind} value={kind}>
                      {t(`kinds.${kind}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldState.invalid ? (
                  <FieldError>{message(fieldState.error?.message)}</FieldError>
                ) : null}
              </Field>
            )}
          />
        ) : null}
        <Controller
          name="titles"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${id}-titles`}>
                {kinds.length > 1
                  ? t("add.titles")
                  : t("add.titlesOf", { kind: kinds[0] })}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${id}-titles`}
                required
                autoFocus={autoFocus}
                rows={4}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? `${id}-hint ${id}-error` : `${id}-hint`
                }
              />
              <FieldDescription id={`${id}-hint`}>
                {t("add.titlesHint")}
              </FieldDescription>
              {fieldState.invalid ? (
                <FieldError id={`${id}-error`}>
                  {message(fieldState.error?.message)}
                </FieldError>
              ) : null}
            </Field>
          )}
        />
        {rootError ? (
          <p role="alert" className="text-destructive text-sm">
            {rootError}
          </p>
        ) : null}
        <Field orientation="horizontal">
          <Button type="submit" disabled={submitting}>
            {submitting ? t("add.submitting") : t("add.submit")}
          </Button>
          <p role="status" className="text-muted-foreground text-sm">
            {added === undefined ? null : t("add.added", { count: added })}
          </p>
        </Field>
      </FieldGroup>
    </form>
  );
}
