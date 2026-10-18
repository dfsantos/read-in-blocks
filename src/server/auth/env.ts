import * as z from "zod";

import { createAllowlist, type Allowlist } from "./allowlist";

// Auth configuration read from the environment (ADR-0005, ADR-0016) and validated on the server.
// Error messages name the variable, never its value.

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const authEnvSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    BETTER_AUTH_SECRET: optionalText.pipe(
      z
        .string()
        .min(32, "BETTER_AUTH_SECRET must have at least 32 characters")
        .optional(),
    ),
    BETTER_AUTH_URL: optionalText.pipe(
      z
        .url({
          protocol: /^https?$/,
          error: "BETTER_AUTH_URL must be an http(s) URL",
        })
        .optional(),
    ),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    AUTH_ALLOWED_EMAILS: optionalText,
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || env.BETTER_AUTH_SECRET !== undefined,
    {
      error: "BETTER_AUTH_SECRET is required in production",
      path: ["BETTER_AUTH_SECRET"],
    },
  )
  .refine(
    (env) =>
      (env.GOOGLE_CLIENT_ID === undefined) ===
      (env.GOOGLE_CLIENT_SECRET === undefined),
    {
      error: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
      path: ["GOOGLE_CLIENT_ID"],
    },
  );

const allowlistSchema = z.array(
  z.email({ error: "AUTH_ALLOWED_EMAILS has an invalid e-mail" }),
);

export type AuthEnv = {
  secret: string | undefined;
  baseURL: string | undefined;
  // Absent on Preview by design (ADR-0016): the login page then says sign-in is unavailable.
  google: { clientId: string; clientSecret: string } | undefined;
  allowlist: Allowlist;
};

export function parseAuthEnv(
  source: Record<string, string | undefined>,
): AuthEnv {
  const parsed = authEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `invalid auth configuration: ${describeIssues(parsed.error)}`,
    );
  }
  const env = parsed.data;

  const entries = (env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const emails = allowlistSchema.safeParse(entries);
  if (!emails.success) {
    throw new Error(
      `invalid auth configuration: ${describeIssues(emails.error)}`,
    );
  }

  return {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    allowlist: createAllowlist(emails.data),
  };
}

// Only the messages: an issue's `input` could carry a secret or an e-mail.
function describeIssues(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join("; ");
}
