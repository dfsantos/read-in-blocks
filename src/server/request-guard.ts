// Checks for Route Handlers that change state (US-028, zero-trust.md 1.2). Server Actions get the
// same protection from Next.js (Origin check, serverActions.bodySizeLimit); Route Handlers get none,
// so every write handler calls guardWrite() before doing anything else.

// Larger than anything the auth endpoints receive (a few hundred bytes of JSON).
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

// Same-origin only. Browsers send Origin on every POST/PUT/PATCH/DELETE, so a missing Origin is a
// handcrafted request and is refused too (a cookie alone never authorizes a write). Fetch Metadata
// adds a second signal where the browser supports it.
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  if (origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

// The declared body size, or undefined when it is missing or malformed.
function declaredLength(request: Request): number | undefined {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d{1,15}$/.test(value)) return undefined;
  return Number(value);
}

// Refuses a write before its body is read: 403 for another origin, 411 without a Content-Length
// (a chunked body could be any size), 413 above the limit. Returns undefined when it may proceed.
// The responses carry no detail beyond the status.
export function guardWrite(
  request: Request,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
): Response | undefined {
  if (!isSameOriginRequest(request)) return refuse(403);
  const length = declaredLength(request);
  if (length === undefined) return refuse(411);
  if (length > maxBodyBytes) return refuse(413);
  return undefined;
}

function refuse(status: 403 | 411 | 413): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
