import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt-BR"],
  defaultLocale: "pt-BR",
  // Single active locale: keep URLs clean (`/`, never `/pt-BR`).
  localePrefix: "as-needed",
  // One locale only: no NEXT_LOCALE cookie and no Accept-Language negotiation.
  localeCookie: false,
  localeDetection: false,
});
