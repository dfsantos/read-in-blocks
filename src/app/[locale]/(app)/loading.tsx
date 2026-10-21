import { useTranslations } from "next-intl";

// Shown while a signed-in page loads (US-025): a quiet placeholder, announced to screen readers.
export default function Loading() {
  const t = useTranslations("states");
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6"
    >
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div className="bg-muted h-8 w-1/2 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="bg-muted h-24 w-full animate-pulse rounded-xl motion-reduce:animate-none" />
      <div className="bg-muted h-24 w-full animate-pulse rounded-xl motion-reduce:animate-none" />
    </main>
  );
}
