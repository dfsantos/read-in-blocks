// Browser-side defenses (US-028, zero-trust.md 2.6). A second barrier: a page that renders user
// content safely does not need them, and they limit the damage when something slips through.
// How to allow a new source: docs/security/headers.md.

// Header the proxy uses to hand the per-request nonce to Server Components (Next.js reads the nonce
// from the request's Content-Security-Policy header itself; this one is for our own <Script>s).
export const NONCE_HEADER = "x-nonce";

// Google profile photos shown in the user menu (US-005). Any other image host falls back to the
// initials.
const GOOGLE_PHOTOS = "https://*.googleusercontent.com";

export type CspOptions = {
  nonce: string;
  // `next dev` needs eval (React's debugging tools) and injects styles without a nonce.
  dev: boolean;
  // `upgrade-insecure-requests` only over https: on http://localhost it would break every asset.
  https: boolean;
};

// The policy of every page. Scripts run only with this request's nonce ('strict-dynamic' lets them
// load their own chunks); no 'unsafe-eval' or 'unsafe-inline' outside `next dev`.
export function pageCsp({ nonce, dev, https }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data: ${GOOGLE_PHOTOS}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

// API responses are JSON, never documents: nothing may load or frame them.
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

// Headers of every response, pages and API alike (next.config.ts). The page CSP comes from the
// proxy because it carries a nonce.
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{
  key: string;
  value: string;
}> = [
  // Two years, subdomains included. Browsers ignore it over http (localhost).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy twin of frame-ancestors 'none', for browsers without CSP level 2.
  { key: "X-Frame-Options", value: "DENY" },
  // Sign-in is a full-page redirect to Google, never a popup, so the window can be isolated.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "browsing-topics=()",
    ].join(", "),
  },
];

// Authenticated responses must never be stored by a browser, proxy or CDN.
export const PRIVATE_NO_STORE = "private, no-store";

// A fresh, unguessable nonce per request (128 bits, base64).
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
