"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { ReadingDatesFormValues } from "@/domain/reading/reading-input";
import {
  READING_STATUSES,
  type ReadingState,
  type ReadingStatus,
} from "@/domain/reading/status";
import { useRouter } from "@/i18n/navigation";
import type {
  ReadingResult,
  StructureErrorKey,
} from "@/server/actions/book-nodes";

export type ReadingActions = Readonly<{
  setStatus: (
    nodeId: string,
    input: { status: ReadingStatus },
  ) => Promise<ReadingResult>;
  setDates: (
    nodeId: string,
    input: ReadingDatesFormValues,
  ) => Promise<ReadingResult>;
}>;

type Props = Readonly<{
  node: { id: string; title: string } & ReadingState;
  actions: ReadingActions;
  // Read out by screen readers after a change.
  announce: (message: string) => void;
}>;

// A calendar day ("YYYY-MM-DD") as a Date at noon UTC, so formatting it in the app's time zone
// (D-19) never shifts it to the day before or after.
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

// The reading state of a leaf (US-013): a select to mark it not started, in progress or completed,
// the dates that come with it, and a form to correct them (to log a past reading). The page
// refreshes its data without reloading (router.refresh).
export function ReadingControls({ node, actions, announce }: Props) {
  const t = useTranslations("structure");
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [errorKey, setErrorKey] = useState<StructureErrorKey>();

  async function changeStatus(status: ReadingStatus) {
    setPending(true);
    setErrorKey(undefined);
    const result = await actions.setStatus(node.id, { status });
    setPending(false);
    if (result.ok) {
      announce(
        t("reading.changed", {
          title: node.title,
          status: t(`reading.statuses.${status}`),
        }),
      );
      router.refresh();
      return;
    }
    setErrorKey(result.errorKey);
  }

  const day = (value: string) =>
    format.dateTime(asDate(value), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor={`${id}-status`} className="sr-only">
            {t("reading.label", { title: node.title })}
          </FieldLabel>
          <NativeSelect
            id={`${id}-status`}
            size="sm"
            value={node.status}
            disabled={pending}
            onChange={(event) =>
              changeStatus(event.target.value as ReadingStatus)
            }
          >
            {READING_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {t(`reading.statuses.${status}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {node.startedAt ? (
          <span className="text-muted-foreground text-xs">
            {t("reading.startedAt", { date: day(node.startedAt) })}
          </span>
        ) : null}
        {node.completedAt ? (
          <span className="text-muted-foreground text-xs">
            {t("reading.completedAt", { date: day(node.completedAt) })}
          </span>
        ) : null}
        {node.status !== "not_started" ? (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={editing}
            aria-label={t("reading.editDatesFor", { title: node.title })}
            onClick={() => setEditing((open) => !open)}
          >
            {t("reading.editDates")}
          </Button>
        ) : null}
      </div>
      {errorKey ? (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${errorKey}`)}
        </p>
      ) : null}
      {editing && node.status !== "not_started" ? (
        <ReadingDatesForm
          node={node}
          action={actions.setDates}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}

function ReadingDatesForm({
  node,
  action,
  onDone,
}: Readonly<{
  node: Props["node"];
  action: ReadingActions["setDates"];
  onDone: () => void;
}>) {
  const t = useTranslations("structure");
  const router = useRouter();
  const id = useId();
  const [startedAt, setStartedAt] = useState(node.startedAt ?? "");
  const [completedAt, setCompletedAt] = useState(node.completedAt ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    key: StructureErrorKey;
    field?: "startedAt" | "completedAt";
  }>();

  const fieldError = (field: "startedAt" | "completedAt") =>
    error && (error.field ?? "startedAt") === field ? error.key : undefined;

  return (
    <form
      noValidate
      aria-label={t("reading.datesLegend", { title: node.title })}
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        const result = await action(node.id, {
          startedAt,
          completedAt: node.status === "completed" ? completedAt : "",
        });
        setPending(false);
        if (result.ok) {
          router.refresh();
          onDone();
          return;
        }
        setError({ key: result.errorKey, field: result.field });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      className="flex flex-wrap items-start gap-3 rounded-xl border p-3"
    >
      <DayField
        id={`${id}-start`}
        label={t("reading.start")}
        value={startedAt}
        onChange={setStartedAt}
        errorKey={fieldError("startedAt")}
        autoFocus
      />
      {node.status === "completed" ? (
        <DayField
          id={`${id}-completion`}
          label={t("reading.completion")}
          value={completedAt}
          onChange={setCompletedAt}
          errorKey={fieldError("completedAt")}
        />
      ) : null}
      <div className="flex gap-2 self-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("reading.saving") : t("reading.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("reading.cancel")}
        </Button>
      </div>
    </form>
  );
}

function DayField({
  id,
  label,
  value,
  onChange,
  errorKey,
  autoFocus,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errorKey?: StructureErrorKey;
  autoFocus?: boolean;
}>) {
  const t = useTranslations("structure");
  return (
    <Field data-invalid={errorKey !== undefined} className="w-auto">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errorKey !== undefined}
        aria-describedby={errorKey ? `${id}-error` : undefined}
      />
      {errorKey ? (
        <FieldError id={`${id}-error`}>{t(`errors.${errorKey}`)}</FieldError>
      ) : null}
    </Field>
  );
}
