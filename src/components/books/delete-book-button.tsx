"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { useRouter } from "@/i18n/navigation";
import { LIBRARY_PATH } from "@/lib/routes";
import type {
  DeleteBookErrorKey,
  DeleteBookResult,
} from "@/server/actions/books";

type Props = Readonly<{
  // The book's title, shown in the confirmation so the reader knows what goes away.
  title: string;
  // The Server Action (deleteBook bound to the book); injected so tests can replace it.
  action: () => Promise<DeleteBookResult>;
}>;

// Deleting a book (US-009, D-09). Nothing is deleted until the reader confirms in the dialog; the
// Server Action checks the session, the owner and the quota again on its own.
export function DeleteBookButton({ title, action }: Props) {
  const t = useTranslations("books.delete");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<DeleteBookErrorKey>();

  async function confirm() {
    setPending(true);
    setErrorKey(undefined);
    const result = await action();
    if (result.ok) {
      // The book page no longer exists: replace it, so "back" does not lead to a 404.
      router.replace(LIBRARY_PATH);
      return;
    }
    setErrorKey(result.errorKey);
    setPending(false);
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
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        {t("trigger")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("title", { title })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        {errorKey ? (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${errorKey}`)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? t("deleting") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
