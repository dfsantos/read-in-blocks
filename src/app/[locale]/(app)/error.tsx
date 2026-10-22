"use client";

import { ErrorMessage } from "@/components/states/error-message";

// An error in a signed-in page (US-025): the header stays, the page offers to try again.
export default function AppError({ retry }: Readonly<{ retry: () => void }>) {
  return <ErrorMessage retry={retry} />;
}
