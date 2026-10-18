import { createAuthClient } from "better-auth/react";

// Browser client for the Better Auth endpoints under /api/auth (same origin, so no baseURL).
export const authClient = createAuthClient();
