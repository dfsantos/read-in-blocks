"use client";

import { ErrorMessage } from "@/components/states/error-message";

// An error outside the signed-in pages, or in their layout (US-025).
export default function LocaleError({
  retry,
}: Readonly<{ retry: () => void }>) {
  return <ErrorMessage retry={retry} />;
}
