import { routing } from "@/i18n/routing";

// App paths shared by the proxy, pages and actions (US-005). Paths have no locale prefix
// (`localePrefix: "as-needed"` with a single locale).
export const LOGIN_PATH = "/login";
// Where signed-in readers land. The library page itself arrives in US-008.
export const LIBRARY_PATH = "/";
// Book pages (US-007).
export const NEW_BOOK_PATH = "/books/new";
export function bookPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}`;
}
// Query parameter carrying the page an anonymous visitor tried to open.
export const NEXT_PARAM = "next";

const MAX_NEXT_LENGTH = 2048;
// Any base works: it only lets URL resolve the path, and a result on another origin is refused.
const PLACEHOLDER_ORIGIN = "http://next.invalid";

function withoutLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

// Pages an anonymous visitor may open. Everything else needs a session.
export function isPublicPath(pathname: string): boolean {
  return withoutLocale(pathname) === LOGIN_PATH;
}

// A path that stays on this site wherever a browser resolves it: one leading `/`, never `//` or a
// backslash (both read as another host), no control characters.
function isSameSitePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(path)
  );
}

// The `?next=` value made safe to redirect to: an absolute path on this site, or undefined.
// Refuses other origins (`//host`, `\\host`, `https:`), control characters, the login page itself
// (no loop) and API routes, so the value can never become an open redirect. The checks run again
// on the normalized path: dot segments can turn `/..//host` into `//host`. Percent-encoding in the
// path is refused (it could hide `.`, `/` or `api`; Better Auth refuses it in `callbackURL` too),
// and the `#hash` is dropped (Better Auth refuses it as well).
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_NEXT_LENGTH) {
    return undefined;
  }
  if (!isSameSitePath(value)) return undefined;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return undefined;
  if (!isSameSitePath(url.pathname) || url.pathname.includes("%")) {
    return undefined;
  }

  const pathname = withoutLocale(url.pathname);
  if (isPublicPath(pathname)) return undefined;
  if (pathname === "/api" || pathname.startsWith("/api/")) return undefined;

  return `${url.pathname}${url.search}`;
}

// The login URL for an anonymous visitor of `pathname` + `search`, remembering the destination.
export function loginURL(base: string | URL, destination: string): URL {
  const url = new URL(LOGIN_PATH, base);
  const next = safeNextPath(destination);
  if (next !== undefined && next !== LIBRARY_PATH) {
    url.searchParams.set(NEXT_PARAM, next);
  }
  return url;
}
