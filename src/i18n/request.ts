import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";
import { APP_TIME_ZONE } from "./time-zone";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Fixed, so the server and the browser format dates alike (D-19).
    timeZone: APP_TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
