/** Flattens a nested message catalog into dot-separated keys. */
export function flattenKeys(messages: unknown, prefix = ""): string[] {
  if (typeof messages !== "object" || messages === null) {
    return [prefix];
  }
  return Object.entries(messages).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Returns, per locale, the keys that exist in some other catalog but are
 * missing from this one. Empty result means all catalogs are in sync.
 */
export function findMissingKeys(
  catalogs: Record<string, unknown>,
): Record<string, string[]> {
  const keysByLocale = Object.entries(catalogs).map(
    ([locale, messages]) => [locale, new Set(flattenKeys(messages))] as const,
  );
  const allKeys = new Set(keysByLocale.flatMap(([, keys]) => [...keys]));

  const missing: Record<string, string[]> = {};
  for (const [locale, keys] of keysByLocale) {
    const absent = [...allKeys].filter((key) => !keys.has(key)).sort();
    if (absent.length > 0) {
      missing[locale] = absent;
    }
  }
  return missing;
}
