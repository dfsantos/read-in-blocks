import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Local runs read .env.local; on Vercel and CI the variables come from the environment.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Migrations run with the `migrator` role (DDL), never with the app role (ADR-0014).
const url = process.env.MIGRATOR_DATABASE_URL;
if (!url && process.argv.includes("migrate")) {
  throw new Error("MIGRATOR_DATABASE_URL is not set");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: url ?? "" },
  strict: true,
  verbose: true,
});
