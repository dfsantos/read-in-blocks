import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BookForm } from "@/components/books/book-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createBook } from "@/server/actions/books";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("books.create");
  return { title: t("metadataTitle") };
}

// Book creation (US-007). The page guards itself; the action guards itself again.
export default async function NewBookPage() {
  await requireUser();
  const t = await getTranslations("books.create");

  return (
    <main className="flex flex-1 justify-center p-4 sm:p-6">
      <Card className="w-full max-w-lg self-start">
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <BookForm action={createBook} />
        </CardContent>
      </Card>
    </main>
  );
}
