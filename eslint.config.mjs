import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Data access only through src/server/repositories (ADR-0008, docs/architecture/data-access.md).
  // The ignores are the layers allowed to reach the database, plus documented exceptions.
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: [
      "src/db/**",
      "src/server/repositories/**",
      // Better Auth's own data layer needs the client and its tables.
      "src/server/auth/index.ts",
      "src/server/auth/cli.ts",
      // Public health check: a fixed query in src/db/health.ts (zero-trust.md, exceptions).
      "src/app/api/health/route.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)db(/|$)",
              message:
                "Database modules are reachable only from src/server/repositories (ADR-0008).",
            },
            {
              regex: "^(drizzle-orm|pg|postgres|@neondatabase/serverless)(/|$)",
              message:
                "Database drivers are reachable only from src/db and src/server/repositories (ADR-0008).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated reports and coverage:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
