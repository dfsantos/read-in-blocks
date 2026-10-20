"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  bookInputSchema,
  type BookFormValues,
  type BookInput,
} from "@/domain/books/book-input";
import { useRouter } from "@/i18n/navigation";
import { bookPath } from "@/lib/routes";
import type {
  BookActionErrorKey,
  CreateBookResult,
  UpdateBookResult,
} from "@/server/actions/books";

type Props = Readonly<{
  // The Server Action (createBook, or updateBook bound to the book); injected so tests can replace
  // it.
  action: (
    input: BookFormValues,
  ) => Promise<CreateBookResult | UpdateBookResult>;
  // "edit" starts from the book's current values and saves instead of creating (US-009).
  mode?: "create" | "edit";
  initialValues?: { title: string; author: string | null };
}>;

// Book creation and edition form (US-007, US-009, D-08). The schema here is only for quick
// feedback: the Server Action parses the input again and decides.
export function BookForm({ action, mode = "create", initialValues }: Props) {
  const t = useTranslations("books.form");
  const router = useRouter();
  const form = useForm<BookFormValues, unknown, BookInput>({
    resolver: zodResolver(bookInputSchema),
    defaultValues: {
      title: initialValues?.title ?? "",
      author: initialValues?.author ?? "",
    },
  });

  // Field errors carry a key of books.form.errors (bookInputErrors), never text.
  const message = (key: string | undefined) =>
    key ? t(`errors.${key as BookActionErrorKey}`) : undefined;

  async function onSubmit(values: BookInput) {
    const result = await action({
      title: values.title,
      author: values.author ?? "",
    });
    if (result.ok) {
      router.push(bookPath(result.data.id));
      return;
    }
    form.setError(
      result.field ?? "root",
      { message: result.errorKey },
      { shouldFocus: true },
    );
  }

  const rootError = message(form.formState.errors.root?.message);
  const submitting =
    form.formState.isSubmitting || form.formState.isSubmitSuccessful;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="book-title">{t("title")}</FieldLabel>
              <Input
                {...field}
                id="book-title"
                required
                autoFocus
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "book-title-error" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError id="book-title-error">
                  {message(fieldState.error?.message)}
                </FieldError>
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="author"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="book-author">{t("author")}</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="book-author"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "book-author-hint book-author-error"
                    : "book-author-hint"
                }
              />
              <FieldDescription id="book-author-hint">
                {t("authorHint")}
              </FieldDescription>
              {fieldState.invalid ? (
                <FieldError id="book-author-error">
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
            {mode === "edit"
              ? submitting
                ? t("saving")
                : t("save")
              : submitting
                ? t("submitting")
                : t("submit")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
