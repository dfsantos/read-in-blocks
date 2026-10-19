import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const SOURCE_FILES = "src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}";

const DB_PATH = "(^|/)db(/|$)";

const DB_MODULES = {
  regex: DB_PATH,
  message:
    "Database modules are reachable only from src/server/repositories (ADR-0008).",
};

const DB_DRIVERS = {
  regex:
    "^(drizzle-orm|pg|pg-[\\w-]+|postgres|@neondatabase/[\\w-]+|@vercel/postgres)(/|$)",
  message:
    "Database drivers are reachable only from src/db and src/server/repositories (ADR-0008).",
};

// The Better Auth instance reaches every reader's data through its adapter.
const AUTH_INSTANCE = {
  regex: "(^|/)auth(/index)?$",
  importNames: ["getAuth", "createAuth"],
  message:
    "Use requireUser() from @/server/auth/session; the auth instance is for src/server/auth and the auth route only.",
};

const DB_REEXPORT_ALL = {
  selector: `ExportAllDeclaration[source.value=/${DB_PATH.replaceAll("/", "\\/")}/]`,
  message:
    "Never re-export database modules: callers would bypass the repositories.",
};

const DB_REEXPORT = {
  selector: `ExportNamedDeclaration[source.value=/${DB_PATH.replaceAll("/", "\\/")}/]`,
  message:
    "Never re-export database modules: callers would bypass the repositories.",
};

const AUTH_CONTEXT = {
  selector: "MemberExpression[property.name='$context']",
  message:
    "Better Auth's $context exposes its unscoped adapter; use it only inside src/server/auth.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Data-access boundary (ADR-0008, docs/architecture/data-access.md, US-006). In flat config the
  // last matching block replaces a rule's options, so each group of files gets its full set.
  {
    files: [SOURCE_FILES],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DB_MODULES, DB_DRIVERS, AUTH_INSTANCE] },
      ],
      "no-restricted-syntax": [
        "error",
        DB_REEXPORT_ALL,
        DB_REEXPORT,
        AUTH_CONTEXT,
      ],
    },
  },
  // The data layer itself.
  {
    files: ["src/db/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
  {
    files: ["src/server/repositories/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [AUTH_INSTANCE] }],
    },
  },
  // Code that drives Better Auth (route, sign-out action, session guard) may use its instance,
  // but not the database.
  {
    files: [
      "src/server/auth/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}",
      "src/app/api/auth/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}",
      "src/server/actions/auth.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DB_MODULES, DB_DRIVERS] },
      ],
      "no-restricted-syntax": ["error", DB_REEXPORT_ALL, DB_REEXPORT],
    },
  },
  // Better Auth's own data layer needs the client and its tables.
  {
    files: ["src/server/auth/index.ts", "src/server/auth/cli.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Public health check: a fixed query in src/db/health.ts (zero-trust.md, exceptions).
  {
    files: ["src/app/api/health/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [DB_DRIVERS, AUTH_INSTANCE] },
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
