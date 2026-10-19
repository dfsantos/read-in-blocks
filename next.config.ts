import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { API_CSP, STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Security headers (US-028, docs/security/headers.md). Pages get their nonce CSP from the proxy;
  // API routes skip the proxy and get a CSP that allows nothing.
  async headers() {
    return [
      { source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: API_CSP }],
      },
    ];
  },
  // Not exposed: it only tells attackers which framework to target.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Default is 1 MB. Today's actions take no input; raise it per need (rich notes, US-019).
      // No allowedOrigins: only same-origin calls pass Next.js's Origin check (CSRF).
      bodySizeLimit: "100kb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
