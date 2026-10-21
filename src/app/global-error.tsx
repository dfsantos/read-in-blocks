"use client";

import messages from "../../messages/pt-BR.json";

import "./globals.css";

// Last resort (US-025): an error in the root layout itself, where neither the layout nor the
// translations provider exist. The texts still come from the catalog.
export default function GlobalError({
  retry,
}: Readonly<{ error: unknown; retry: () => void }>) {
  const t = messages.states.error;
  return (
    <html lang="pt-BR">
      <body className="flex min-h-full flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-3 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground">{t.description}</p>
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium"
            onClick={() => retry()}
          >
            {t.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
