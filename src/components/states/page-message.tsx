import type { ReactNode } from "react";

// The one layout of the app's full-page states (US-025): not found, an error, nothing yet. A
// heading, a sentence and what the reader can do next.
export function PageMessage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children?: ReactNode }>) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-3 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      {children ? (
        <div className="flex flex-wrap gap-2 pt-1">{children}</div>
      ) : null}
    </main>
  );
}
